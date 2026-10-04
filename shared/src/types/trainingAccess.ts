/**
 * Phase 6 — Open Training Access (guest entry via QR/link, no account).
 * Mirrors `training_access_grants` / `guest_training_sessions`
 * (supabase/migrations/00000000000016_training_access.sql).
 *
 * The raw access token itself only ever appears in two client-facing
 * places: the admin's create-grant response (`TrainingAccessGrantCreated`,
 * shown once so the admin can copy the join link/QR) and the trainee's
 * own join URL — never in any list/read response afterward, since only
 * its hash is stored server-side.
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

/** Returned only once, immediately after `POST /admin/training-access`. */
export interface TrainingAccessGrantCreated extends TrainingAccessGrant {
  token: string;
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
 * "revoked" (their grant was revoked) or "expired" (their own session
 * timed out), which registered-student analytics has no equivalent of.
 */
export interface GuestTraineeAnalyticsRow {
  guestSessionId: string;
  displayName: string;
  grantId: string;
  /** "active"/"expired" from the session row itself, plus "revoked" if
   * the owning grant has since been revoked (independent of the
   * session's own `status` column — a grant can be revoked after a
   * guest already joined). */
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
