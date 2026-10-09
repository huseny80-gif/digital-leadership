import type {
  TrainingAccessGrant,
  TrainingAccessGrantCreated,
  TrainingAccessJoinInfo,
  GuestTrainingSession,
  GuestTraineeAnalyticsRow,
  TrainingAccessShareLink,
} from "@shared/index";
import type { GrantRow, GuestSessionRow, TrainingAccessRepository } from "./trainingAccessRepository.js";
import { generateAccessToken, hashToken, hashesEqual } from "./token.js";
import { validateTraineeName } from "./nameValidation.js";
import { conflict, notFound } from "../lib/httpError.js";
import { randomUUID } from "node:crypto";
import { encryptShareToken, decryptShareToken } from "./shareToken.js";

function toGrant(row: GrantRow): TrainingAccessGrant {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    maxSessions: row.max_sessions,
    sessionCount: Number(row.session_count),
    revoked: row.revoked,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGuestSession(row: GuestSessionRow): GuestTrainingSession {
  return {
    id: row.id,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
  };
}

/** Whether a grant currently permits creating a new guest session — NOT
 * whether an already-joined guest may keep using an already-issued
 * session (that's `isGuestSessionUsable`, checked independently so a
 * grant revoked mid-training doesn't retroactively kill sessions already
 * in progress unless the admin also wants that, matching task
 * requirement #20: "a revoked link no longer permits NEW session
 * creation"). */
function isGrantJoinable(row: GrantRow): boolean {
  if (row.revoked) return false;
  if (row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now()) return false;
  return true;
}

export class TrainingAccessService {
  constructor(
    private readonly repository: TrainingAccessRepository,
    private readonly webBaseUrl: string,
    private readonly shareStorageSecret?: string,
  ) {}

  async createGrant(params: {
    label: string | null;
    description: string | null;
    maxSessions: number | null;
    createdBy: string;
  }): Promise<TrainingAccessGrantCreated> {
    const token = generateAccessToken();
    const tokenHash = hashToken(token);
    const id = this.shareStorageSecret ? randomUUID() : undefined;
    const row = await this.repository.createGrant({
      ...(id ? { id, shareTokenCiphertext: encryptShareToken(token, this.shareStorageSecret!, id) } : {}),
      tokenHash,
      label: params.label,
      description: params.description,
      maxSessions: params.maxSessions,
      expiresAt: null,
      createdBy: params.createdBy,
    });
    return {
      ...toGrant(row),
      token,
      joinUrl: `${this.webBaseUrl.replace(/\/$/, "")}/join/${token}`,
    };
  }

  async listGrants(): Promise<TrainingAccessGrant[]> {
    const rows = await this.repository.listGrants();
    return rows.map(toGrant);
  }

  async getGrantOrThrow(id: string): Promise<TrainingAccessGrant> {
    const row = await this.repository.getGrantById(id);
    if (!row) throw notFound("Training access grant");
    return toGrant(row);
  }

  async revokeGrant(id: string): Promise<void> {
    const row = await this.repository.getGrantById(id);
    if (!row) throw notFound("Training access grant");
    await this.repository.revokeGrant(id);
  }

  async getShareLink(id: string): Promise<TrainingAccessShareLink> {
    if (!this.shareStorageSecret) throw new Error("Training link storage is not configured");
    const candidate = generateAccessToken();
    const stored = await this.repository.getOrCreateShareToken(id, {
      hash: hashToken(candidate),
      ciphertext: encryptShareToken(candidate, this.shareStorageSecret, id),
    });
    if (!stored) throw notFound("Training access link");
    const token = decryptShareToken(stored.ciphertext, this.shareStorageSecret, id);
    if (!hashesEqual(hashToken(token), stored.hash)) throw new Error("Stored training link integrity check failed");
    return { grantId: id, joinUrl: `${this.webBaseUrl.replace(/\/$/, "")}/join/${token}` };
  }

  async cleanDisabledGrants(): Promise<{ removed: number }> {
    return { removed: await this.repository.cleanDisabledGrants() };
  }

  /** Public: resolves a raw token to join-page info WITHOUT creating a
   * session — the join page's initial GET, so a guest sees the program
   * name/description before typing their name. Deliberately returns the
   * same 404 for "no such token", "expired", and "revoked" (never
   * distinguishes them in the response body) so a brute-force scan can't
   * use the response to fingerprint which case it hit — see
   * `nameValidation`/task requirement #8's "blunt brute-force token
   * guessing"; the rate limiter (routes layer) is the primary defense,
   * this is a secondary one. */
  async resolveJoinInfo(rawToken: string): Promise<TrainingAccessJoinInfo> {
    const row = await this.repository.getGrantByTokenHash(hashToken(rawToken));
    if (!row || !isGrantJoinable(row)) {
      throw notFound("Training access link");
    }
    return { title: row.label ?? "Digital Leadership", description: row.description };
  }

  /** Public: validates the token + trainee name and creates a new guest
   * session. Never returns the grant's own id/token — only the new guest
   * session's own identity (task requirement #3: the session, not the
   * grant, is what subsequent requests are authorized against). */
  async joinWithToken(rawToken: string, rawName: unknown): Promise<{ session: GuestTrainingSession }> {
    const row = await this.repository.getGrantByTokenHash(hashToken(rawToken));
    if (!row || !isGrantJoinable(row)) {
      throw notFound("Training access link");
    }
    const displayName = validateTraineeName(rawName);

    if (row.max_sessions !== null) {
      const activeCount = await this.repository.countActiveSessionsForGrant(row.id);
      if (activeCount >= row.max_sessions) {
        throw conflict("This training access link has reached its maximum number of participants.");
      }
    }

    const sessionRow = await this.repository.createGuestSession({
      grantId: row.id,
      displayName,
      expiresAt: null,
    });
    return { session: toGuestSession(sessionRow) };
  }

  /** Resolves and revalidates an existing guest session by id (from the
   * verified cookie) — used by `guestSessionMiddleware` on every guest
   * request. Returns null (never throws) for "not usable", so the
   * middleware can decide 401 vs. clearing the cookie without a
   * try/catch per request. */
  /** Admin-only (route layer gates this with `requireAdmin`, same as
   * every other admin method in this codebase). Never reachable from any
   * guest-facing route — no guest-facing endpoint anywhere in
   * `guestSessionMiddleware`-gated routes returns a list of trainees,
   * only ever the calling guest's own single session. */
  async listGuestAnalytics(): Promise<GuestTraineeAnalyticsRow[]> {
    const rows = await this.repository.listGuestAnalytics();
    return rows.map((row) => ({
      guestSessionId: row.guest_session_id,
      displayName: row.display_name,
      grantId: row.grant_id,
      status: row.status,
      joinedAt: row.joined_at,
      lastSeenAt: row.last_seen_at,
      lecturesCompleted: Number(row.lectures_completed),
      totalLectures: Number(row.total_lectures),
      quizzesStarted: Number(row.quizzes_started),
      quizzesCompleted: Number(row.quizzes_completed),
      averageScore: row.average_score !== null ? Number(row.average_score) : null,
    }));
  }

  async resolveUsableSession(sessionId: string): Promise<GuestTrainingSession | null> {
    const row = await this.repository.getGuestSessionById(sessionId);
    if (!row) return null;
    if (row.status !== "active") return null;
    if (row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now()) return null;
    await this.repository.touchLastSeen(sessionId);
    return toGuestSession(row);
  }
}
