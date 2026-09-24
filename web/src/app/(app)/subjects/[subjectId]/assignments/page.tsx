import type { Assignment, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { AssignmentCard } from "@/components/content/AssignmentCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

/**
 * Assignments list for a subject (`GET /api/v1/subjects/:subjectId/assignments`
 * — PHASE 12P). Same visibility rule as every other content listing: a
 * draft subject, or one this caller cannot see, 404s — never a
 * distinguishing 403 (SECURITY_ARCHITECTURE.md §13). Assignments are
 * 100% subject-scoped (`lectureId` is always `null` for the migrated
 * Finquiz data) — this page never reads or depends on `lectureId`.
 */
export default async function SubjectAssignmentsPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

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
      errorMessage = toSafeErrorMessage(err, "assignments").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}/assignments`} />;
  }

  return (
    <section>
      <Breadcrumbs
        items={[{ label: "Subjects", href: "/subjects" }, { label: subject!.title, href: `/subjects/${subjectId}` }, { label: "Assignments" }]}
      />
      <h1 className="page-heading">Assignments</h1>
      <p className="page-subheading">Assignments available for {subject!.title}.</p>

      {assignments.length === 0 ? (
        <EmptyState title="No assignments yet" message="Assignments for this subject will appear here once published." />
      ) : (
        <div className="item-list">
          {assignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </section>
  );
}
