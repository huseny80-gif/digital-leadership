/**
 * Phase 6 — Open Training Access (guest entry via QR/link, no account).
 * Mirrors `training_access_grants` / `guest_training_sessions`
 * (supabase/migrations/00000000000016_training_access.sql).
 *
 * Hashes authorize joins; an authenticated ciphertext also lets admins
 * retrieve a persistent share link through a dedicated admin endpoint.
 * Raw links never appear in grant or trainee list responses.
 */

export interface TrainingAccessGrant {
  id: string;
  label: string | null;
  description: string | null;
  maxSessions: number | null;
  sessionCount: number;
  revoked: boolean;
  revokedAt: string | null;
  /** Null means permanent access, with no platform time limit. */
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Creation response; admins can retrieve the same link later. */
export interface TrainingAccessGrantCreated extends TrainingAccessGrant {
  token: string;
  joinUrl: string;
}

/** Dedicated admin-only response. Never included in grant/guest lists. */
export interface TrainingAccessShareLink {
  grantId: string;
  joinUrl: string;
}

export interface TrainingAccessJoinInfo {
  title: string;
  description: string | null;
}

export interface GuestTrainingSession {
  id: string;
  displayName: string;
  status: "active" | "expired" | "revoked";
  createdAt: string;
  lastSeenAt: string;
  /** Null means the learner session has no platform time limit. */
  expiresAt: string | null;
}

/**
 * Admin-only guest trainee analytics row (task requirement #10 / the
 * dedicated follow-up task's "Guest analytics for admins"). A new read
 * path (`GET /admin/training-access/guests`), never merged into the
 * existing registered-user `AdminStudentAnalyticsRow` shape — guests
 * have no `users` row, no email, and their status can additionally be
 * "revoked" (the session was revoked) or "expired" (their own session
 * timed out), which registered-student analytics has no equivalent of.
 */
export interface GuestTraineeAnalyticsRow {
  guestSessionId: string;
  displayName: string;
  grantId: string;
  /** Actual session usability. Disabling an old join link only prevents
   * new entrants and does not stop guests who have already joined. */
  status: "active" | "expired" | "revoked";
  joinedAt: string;
  lastSeenAt: string;
  lecturesCompleted: number;
  totalLectures: number;
  quizzesStarted: number;
  quizzesCompleted: number;
  /** Average raw `score` (points, not a percentage) across this guest's
   * `graded` attempts — null if none are graded yet. Computing a true
   * percentage would need each attempt's own total-possible-points,
   * which varies per quiz; left as a documented scope limit rather than
   * silently mislabeling a raw average as a percentage. */
  averageScore: number | null;
}
