import Link from "next/link";
import type { Assignment, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

/**
 * Assignment detail — Phase 21.4 — Assignment Experience Upgrade.
 *
 * There is no learner-facing `GET /assignments/:assignmentId` endpoint
 * anywhere in the backend (confirmed by auditing `contentRoutes.ts`,
 * `content/contentRepository.ts`, and `admin/adminRoutes.ts` — the only
 * by-id assignment routes are `PATCH`/`DELETE /admin/assignments/:id`,
 * admin-only and not read endpoints). Per rule 4 ("no backend API changes
 * unless a proven blocker exists"), this page does NOT add one: the
 * `Assignment` model (`shared/src/types/content.ts`) has no field beyond
 * what the existing `GET /subjects/:subjectId/assignments` list already
 * returns, so a by-id fetch would return identical data to what this page
 * already has available from that list — reusing it, rather than adding a
 * redundant endpoint, is the smaller and more honest change.
 *
 * This page therefore fetches the subject's full assignment list (already
 * ordered `order_index asc, title asc` server-side — same endpoint the
 * subject overview/assignments-list pages already use) and finds this
 * assignment by id within it, exactly the technique
 * `lectures/[lectureId]/page.tsx` (Phase 21.3) uses for its sibling
 * lecture list. If the id isn't present — wrong subject, unpublished, or
 * simply doesn't exist — this renders the same `NotFoundState` every
 * other resource in this app uses for that case (never a distinguishing
 * error, per SECURITY_ARCHITECTURE.md §13).
 */
export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ subjectId: string; assignmentId: string }>;
}) {
  const { subjectId, assignmentId } = await params;

  let subject: Subject | null = null;
  let assignments: Assignment[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [subjectRes, assignmentsRes] = await Promise.all([
      apiGet<Subject>(`/api/v1/subjects/${subjectId}`),
      apiGetPaginated<Assignment>(`/api/v1/subjects/${subjectId}/assignments?page=1&limit=50`),
    ]);
    subject = subjectRes.data;
    assignments = assignmentsRes.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this assignment").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}/assignments/${assignmentId}`} />;
  }

  const currentIndex = assignments.findIndex((a) => a.id === assignmentId);
  const assignment = currentIndex !== -1 ? assignments[currentIndex] : null;

  if (!assignment) {
    return <NotFoundState message="This assignment doesn't exist or is not available." />;
  }

  const previousAssignment = currentIndex > 0 ? assignments[currentIndex - 1] : null;
  const nextAssignment = currentIndex < assignments.length - 1 ? assignments[currentIndex + 1] : null;

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: "Subjects", href: "/subjects" },
          { label: subject!.title, href: `/subjects/${subjectId}` },
          { label: "Assignments", href: `/subjects/${subjectId}/assignments` },
          { label: assignment.title },
        ]}
      />

      <h1 className="page-heading">{assignment.title}</h1>
      <p className="item-row-meta" style={{ marginBottom: "var(--space-2)" }}>
        {subject!.title} · Assignment {currentIndex + 1} of {assignments.length}
        {" · "}
        <span className="badge">{assignment.status === "published" ? "Published" : "Draft"}</span>
      </p>
      {assignment.description ? <p className="page-subheading">{assignment.description}</p> : null}

      <Link
        href={`/subjects/${subjectId}/assignments`}
        className="btn btn-secondary"
        style={{ marginBottom: "var(--space-5)", display: "inline-flex" }}
      >
        Back to subject
      </Link>

      {/* Phase 21.4 task 4 — future submission readiness. Informational
       * placeholder only: no upload control, no fake submission status,
       * no database row. Mirrors the existing wording
       * `LectureItemCard` already uses for lecture-scoped assignment/
       * exercise items ("Submitting … is not available yet."), so a
       * learner sees one consistent message across the app rather than
       * two different-sounding ones. */}
      <div className="content-card">
        <p className="content-card-title">Submission</p>
        <div className="content-card-body">
          <EmptyState
            title="Not available yet"
            message="Submitting your work for this assignment is not available yet."
          />
        </div>
      </div>

      {previousAssignment || nextAssignment ? (
        <nav className="lecture-nav" aria-label="Assignment navigation">
          {previousAssignment ? (
            <Link
              href={`/subjects/${subjectId}/assignments/${previousAssignment.id}`}
              className="lecture-nav-link"
              data-direction="previous"
            >
              <span className="lecture-nav-label">← Previous</span>
              <span className="lecture-nav-title">{previousAssignment.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextAssignment ? (
            <Link
              href={`/subjects/${subjectId}/assignments/${nextAssignment.id}`}
              className="lecture-nav-link"
              data-direction="next"
            >
              <span className="lecture-nav-label">Next →</span>
              <span className="lecture-nav-title">{nextAssignment.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
