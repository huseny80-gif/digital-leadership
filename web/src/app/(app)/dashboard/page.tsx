import Link from "next/link";
import type { PaginatedResult, Subject, UserProfile } from "@shared/index";
import { apiGet, apiGetPaginated } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SubjectCard } from "@/components/content/SubjectCard";

export const metadata = { title: "Dashboard | Digital Leadership" };

/**
 * Authenticated dashboard (WEB_APPLICATION_ARCHITECTURE.md "Dashboard").
 * Uses real API data only — no hard-coded subjects, no invented
 * statistics the API doesn't provide (PHASE 09A explicit instruction).
 */
export default async function DashboardPage() {
  let profile: UserProfile | null = null;
  let subjectsResult: PaginatedResult<Subject> | null = null;
  let errorMessage: string | null = null;

  try {
    const [profileRes, subjectsRes] = await Promise.all([
      apiGet<UserProfile>("/api/v1/me"),
      apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=6"),
    ]);
    profile = profileRes.data;
    subjectsResult = subjectsRes;
  } catch (err) {
    errorMessage = toSafeErrorMessage(err, "your dashboard").message;
  }

  return (
    <section>
      <h1 className="page-heading">
        {profile ? `Welcome, ${profile.displayName}` : "Welcome"}
      </h1>
      <p className="page-subheading">Continue your learning or browse all subjects.</p>

      {errorMessage ? <ErrorState message={errorMessage} retryHref="/dashboard" /> : null}

      {!errorMessage && subjectsResult ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
            <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>Subjects</h2>
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
