import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

process.env.GUEST_SESSION_SIGNING_SECRET = "test-secret";

const { TrainingAccessService } = await import("../../src/trainingAccess/trainingAccessService.js");
const { hashToken } = await import("../../src/trainingAccess/token.js");
const { HttpError } = await import("../../src/lib/httpError.js");
const { ValidationError } = await import("../../src/lib/validation.js");
import type { GrantRow, GuestSessionRow, TrainingAccessRepository } from "../../src/trainingAccess/trainingAccessRepository.js";

/**
 * In-memory fake repository — proves TrainingAccessService's
 * authorization/expiry/revocation logic without a database, matching
 * the `FakeUsersRepository` pattern in `authMiddleware.test.ts`.
 */
class FakeTrainingAccessRepository implements Pick<
  TrainingAccessRepository,
  | "createGrant"
  | "getGrantById"
  | "getGrantByTokenHash"
  | "listGrants"
  | "revokeGrant"
  | "createGuestSession"
  | "getGuestSessionById"
  | "touchLastSeen"
  | "countActiveSessionsForGrant"
> {
  grants = new Map<string, GrantRow>();
  sessions = new Map<string, GuestSessionRow>();
  private grantSeq = 0;
  private sessionSeq = 0;

  async createGrant(params: {
    tokenHash: string;
    label: string | null;
    description: string | null;
    maxSessions: number | null;
    expiresAt: Date | null;
    createdBy: string;
  }): Promise<GrantRow> {
    const id = `grant-${++this.grantSeq}`;
    const row: GrantRow = {
      id,
      label: params.label,
      description: params.description,
      max_sessions: params.maxSessions,
      session_count: "0",
      revoked: false,
      revoked_at: null,
      expires_at: params.expiresAt?.toISOString() ?? null,
      created_by: params.createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.grants.set(id, row);
    return row;
  }

  async getGrantById(id: string) {
    return this.grants.get(id) ?? null;
  }

  async getGrantByTokenHash(tokenHash: string) {
    return [...this.grants.values()].find((g) => hashToken(reverseLookupToken(g.id)) === tokenHash) ?? null;
  }

  async listGrants() {
    return [...this.grants.values()];
  }

  async revokeGrant(id: string) {
    const row = this.grants.get(id);
    if (row) {
      row.revoked = true;
      row.revoked_at = new Date().toISOString();
    }
  }

  async createGuestSession(params: { grantId: string; displayName: string; expiresAt: Date | null }): Promise<GuestSessionRow> {
    const id = `session-${++this.sessionSeq}`;
    const row: GuestSessionRow = {
      id,
      grant_id: params.grantId,
      display_name: params.displayName,
      status: "active",
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: params.expiresAt?.toISOString() ?? null,
    };
    this.sessions.set(id, row);
    const grant = this.grants.get(params.grantId)!;
    grant.session_count = String(Number(grant.session_count) + 1);
    return row;
  }

  async getGuestSessionById(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async touchLastSeen(id: string) {
    const row = this.sessions.get(id);
    if (row) row.last_seen_at = new Date().toISOString();
  }

  async countActiveSessionsForGrant(grantId: string) {
    return [...this.sessions.values()].filter((s) => s.grant_id === grantId && s.status === "active").length;
  }
}

// The fake associates a grant with a raw token via this side channel
// (rather than storing the raw token in the fake row, which would
// contradict the "never store the raw token" design under test) —
// registered by `createGrantWithToken` below.
const tokenByGrantId = new Map<string, string>();
function reverseLookupToken(grantId: string): string {
  return tokenByGrantId.get(grantId) ?? "__no_such_token__";
}

async function createGrantWithToken(
  service: InstanceType<typeof TrainingAccessService>,
  overrides: Partial<Parameters<InstanceType<typeof TrainingAccessService>["createGrant"]>[0]> = {},
) {
  const created = await service.createGrant({
    label: "Cohort A",
    description: "desc",
    maxSessions: null,
    createdBy: "admin-1",
    ...overrides,
  });
  tokenByGrantId.set(created.id, created.token);
  return created;
}

describe("TrainingAccessService", () => {
  afterEach(() => { vi.useRealTimers(); });
  let repo: FakeTrainingAccessRepository;
  let service: InstanceType<typeof TrainingAccessService>;

  beforeEach(() => {
    repo = new FakeTrainingAccessRepository();
    tokenByGrantId.clear();
    service = new TrainingAccessService(repo as unknown as TrainingAccessRepository, "https://example.test");
  });

  it("admin can create an access grant and gets a joinUrl containing the raw token (test case #19)", async () => {
    const created = await createGrantWithToken(service);
    expect(created.joinUrl).toBe(`https://example.test/join/${created.token}`);
    expect(created.token.length).toBeGreaterThan(20);
    expect(created.expiresAt).toBeNull();
    expect(repo.grants.get(created.id)!.expires_at).toBeNull();
  });

  it("the stored grant never carries the raw token, only accessible via join()/joinUrl at creation time", async () => {
    const created = await createGrantWithToken(service);
    const fetched = await service.getGrantOrThrow(created.id);
    expect(fetched).not.toHaveProperty("token");
  });

  it("with the real production WEB_BASE_URL, the generated QR/join URL starts with the production web app's own origin, never localhost", async () => {
    const productionService = new TrainingAccessService(
      repo as unknown as TrainingAccessRepository,
      "https://web-husen4.vercel.app",
    );
    const created = await createGrantWithToken(productionService);
    expect(created.joinUrl.startsWith("https://web-husen4.vercel.app/")).toBe(true);
    expect(created.joinUrl).not.toMatch(/localhost/);
    expect(created.joinUrl).not.toMatch(/127\.0\.0\.1/);
  });

  it("valid access token → join succeeds (test case #1)", async () => {
    const created = await createGrantWithToken(service);
    const { session } = await service.joinWithToken(created.token, "Ahmad Ali Hassan");
    expect(session.displayName).toBe("Ahmad Ali Hassan");
  });

  it("invalid token → rejected (test case #2)", async () => {
    await createGrantWithToken(service);
    await expect(service.joinWithToken("totally-bogus-token", "Ahmad Ali")).rejects.toThrow(HttpError);
  });

  it("expired token → rejected (test case #3)", async () => {
    const created = await createGrantWithToken(service);
    const row = repo.grants.get(created.id)!;
    row.expires_at = new Date(Date.now() - 1000).toISOString(); // force into the past
    await expect(service.joinWithToken(created.token, "Ahmad Ali")).rejects.toThrow(HttpError);
  });

  it("revoked token → rejected, and no new session can be created after revocation (test cases #4, #20)", async () => {
    const created = await createGrantWithToken(service);
    await service.revokeGrant(created.id);
    await expect(service.joinWithToken(created.token, "Ahmad Ali")).rejects.toThrow(HttpError);
  });

  it("empty trainee name → rejected (test case #5)", async () => {
    const created = await createGrantWithToken(service);
    await expect(service.joinWithToken(created.token, "")).rejects.toThrow(ValidationError);
  });

  it("HTML/script injection attempt in name → rejected (test case #6)", async () => {
    const created = await createGrantWithToken(service);
    await expect(service.joinWithToken(created.token, "<script>alert(1)</script>")).rejects.toThrow(ValidationError);
  });

  it("valid Arabic three-part name → accepted (test case #7)", async () => {
    const created = await createGrantWithToken(service);
    const { session } = await service.joinWithToken(created.token, "سارة أحمد المطيري");
    expect(session.displayName).toBe("سارة أحمد المطيري");
  });

  it("guest session creation produces permanent platform-wide learner access", async () => {
    const created = await createGrantWithToken(service);
    const { session } = await service.joinWithToken(created.token, "Ahmad Ali Hassan");
    expect(session).not.toHaveProperty("subjectId");
    expect(session.expiresAt).toBeNull();
    expect(repo.sessions.get(session.id)!.expires_at).toBeNull();
  });

  it("the same link and existing session remain usable after twenty years", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
    const created = await createGrantWithToken(service);
    const { session } = await service.joinWithToken(created.token, "Ahmad Ali Hassan");
    vi.setSystemTime(new Date("2046-10-04T00:00:00Z"));
    expect(await service.resolveUsableSession(session.id)).toMatchObject({ id: session.id, expiresAt: null });
    expect(await service.resolveJoinInfo(created.token)).toMatchObject({ title: "Cohort A" });
    expect((await service.joinWithToken(created.token, "سارة أحمد علي")).session.expiresAt).toBeNull();
  });

  it("session expiration is enforced — an expired session resolves to null, not reusable (test case #14)", async () => {
    const created = await createGrantWithToken(service);
    const { session } = await service.joinWithToken(created.token, "Ahmad Ali Hassan");
    const row = repo.sessions.get(session.id)!;
    row.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await service.resolveUsableSession(session.id)).toBeNull();
  });

  it("a revoked (status) session cannot be resolved", async () => {
    const created = await createGrantWithToken(service);
    const { session } = await service.joinWithToken(created.token, "Ahmad Ali Hassan");
    const row = repo.sessions.get(session.id)!;
    row.status = "revoked";
    expect(await service.resolveUsableSession(session.id)).toBeNull();
  });

  it("resolveUsableSession never confuses one session id for another (isolation building block, test case #9/#13)", async () => {
    const created = await createGrantWithToken(service);
    const first = (await service.joinWithToken(created.token, "Guest A")).session;
    const second = (await service.joinWithToken(created.token, "Guest B")).session;
    expect(first.id).not.toBe(second.id);
    const resolvedA = await service.resolveUsableSession(first.id);
    expect(resolvedA?.displayName).toBe("Guest A");
    const resolvedB = await service.resolveUsableSession(second.id);
    expect(resolvedB?.displayName).toBe("Guest B");
  });

  it("resolveUsableSession returns null for a nonexistent/tampered session id", async () => {
    expect(await service.resolveUsableSession("nonexistent-session-id")).toBeNull();
  });

  it("enforces maxSessions once the active-session count is reached", async () => {
    const created = await createGrantWithToken(service, { maxSessions: 1 });
    await service.joinWithToken(created.token, "Guest A");
    await expect(service.joinWithToken(created.token, "Guest B")).rejects.toThrow(HttpError);
  });

  it("revoking a grant does not affect an already-created session's own row (only blocks new joins)", async () => {
    const created = await createGrantWithToken(service);
    const { session } = await service.joinWithToken(created.token, "Guest A");
    await service.revokeGrant(created.id);
    // The session itself is untouched by revocation — status is still 'active'.
    const row = repo.sessions.get(session.id)!;
    expect(row.status).toBe("active");
  });

  it("resolveJoinInfo never distinguishes 'not found' from 'expired' from 'revoked' in its error", async () => {
    const created = await createGrantWithToken(service);
    await service.revokeGrant(created.id);
    await expect(service.resolveJoinInfo(created.token)).rejects.toMatchObject({ status: 404 });
    await expect(service.resolveJoinInfo("bogus")).rejects.toMatchObject({ status: 404 });
  });
});
