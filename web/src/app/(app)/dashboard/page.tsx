import Link from "next/link";
import type { GuestTrainingSession, LearnerAnalytics, PaginatedResult, Subject, UserProfile } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SubjectCard } from "@/components/content/SubjectCard";
import { LearnerAnalyticsSection } from "@/components/analytics/LearnerAnalyticsSection";

export const metadata = { title: "Dashboard | Digital Leadership" };

/**
 * Authenticated dashboard (WEB_APPLICATION_ARCHITECTURE.md "Dashboard").
 * Uses real API data only — no hard-coded subjects, no invented
 * statistics the API doesn't provide (PHASE 09A explicit instruction).
 *
 * ONE learner platform, multiple principals: a Guest Training Session
 * must be able to browse this same dashboard, not just the subjects
 * list. `GET /api/v1/me` 401s for a guest (no Supabase session), so this
 * falls back to `GET /api/v1/guest/me` for a display name — the same
 * fallback `(app)/layout.tsx` already does to resolve the principal for
 * the shell. The subjects widget below needs no guest-specific handling
 * at all: `GET /api/v1/subjects` already returns exactly the guest's one
 * granted subject (`contentRoutes.ts`). Personal analytics
 * (`/api/v1/analytics/me`) has no guest-session equivalent — a
 * registered-user-only feature this dashboard simply omits for a guest,
 * never a fabricated zero-value substitute.
 */
export default async function DashboardPage() {
  let profile: UserProfile | null = null;
  let guestSession: GuestTrainingSession | null = null;
  let subjectsResult: PaginatedResult<Subject> | null = null;
  let errorMessage: string | null = null;

  try {
    const subjectsRes = await apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=6");
    subjectsResult = subjectsRes;

    try {
      const profileRes = await apiGet<UserProfile>("/api/v1/me");
      profile = profileRes.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const guestRes = await apiGet<GuestTrainingSession>("/api/v1/guest/me");
        guestSession = guestRes.data;
      } else {
        throw err;
      }
    }
  } catch (err) {
    errorMessage = toSafeErrorMessage(err, "your dashboard").message;
  }

  // Analytics is fetched independently — a failure here shouldn't take
  // down the rest of the dashboard (subjects list still renders). Skipped
  // entirely if the main fetch above already failed, or for a guest
  // (no guest-session equivalent exists), so a single outage shows one
  // error state, not two redundant ones.
  let analytics: LearnerAnalytics | null = null;
  let analyticsErrorMessage: string | null = null;
  if (!errorMessage && !guestSession) {
    try {
      const analyticsRes = await apiGet<LearnerAnalytics>("/api/v1/analytics/me");
      analytics = analyticsRes.data;
    } catch (err) {
      analyticsErrorMessage = toSafeErrorMessage(err, "your learning analytics").message;
    }
  }

  const welcomeName = profile?.displayName ?? guestSession?.displayName;

  return (
    <section>
      <h1 className="page-heading">{welcomeName ? `Welcome, ${welcomeName}` : "Welcome"}</h1>
      <p className="page-subheading">Continue your learning or browse all subjects.</p>

      {errorMessage ? <ErrorState message={errorMessage} retryHref="/dashboard" /> : null}

      {analytics ? (
        <LearnerAnalyticsSection analytics={analytics} />
      ) : analyticsErrorMessage ? (
        <ErrorState message={analyticsErrorMessage} retryHref="/dashboard" />
      ) : null}

      {!errorMessage && subjectsResult ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
            <h2 className="content-card-title" style={{ fontSize: "var(--font-size-lg)" }}>
              Subjects
            </h2>
            <Link href="/subjects" className="app-nav-link">
              View all subjects
            </Link>
          </div>

          {subjectsResult.data.length === 0 ? (
            <EmptyState
              title="No subjects available yet"
              message="Check back soon — new subjects will appear here once they're published."
            />
          ) : (
            <div className="card-grid">
              {subjectsResult.data.map((subject) => (
                <SubjectCard key={subject.id} subject={subject} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
