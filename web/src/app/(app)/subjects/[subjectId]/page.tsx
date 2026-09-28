import type { Assignment, Lecture, Quiz, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { LectureCard } from "@/components/content/LectureCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs";

/**
 * Subject detail (API_V1.md `GET /subjects/:subjectId`,
 * `GET /subjects/:subjectId/lectures`). A subject that is real but not
 * visible to this caller (unpublished, non-admin) returns the identical
 * `404` a nonexistent one would (API_SECURITY.md §3) — this page renders
 * the same `NotFoundState` for both, never trying to distinguish them.
 */
export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

  let subject: Subject | null = null;
  let lectures: Lecture[] = [];
  let assignments: Assignment[] = [];
  let quizzes: Quiz[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [subjectRes, lecturesRes, assignmentsRes, quizzesRes] = await Promise.all([
      apiGet<Subject>(`/api/v1/subjects/${subjectId}`),
      apiGetPaginated<Lecture>(`/api/v1/subjects/${subjectId}/lectures?page=1&limit=50`),
      apiGetPaginated<Assignment>(`/api/v1/subjects/${subjectId}/assignments?page=1&limit=50`),
      apiGet<Quiz[]>(`/api/v1/subjects/${subjectId}/assessments`),
    ]);
    subject = subjectRes.data;
    lectures = lecturesRes.data;
    assignments = assignmentsRes.data;
    quizzes = quizzesRes.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this subject").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}`} />;
  }

  return (
    <section>
      <Breadcrumbs items={[{ label: "Subjects", href: "/subjects" }, { label: subject!.title }]} />

      <div className="subject-hero">
        <h1 className="subject-hero-title">{subject!.title}</h1>
        {subject!.description ? (
          <p className="subject-hero-description">{subject!.description}</p>
        ) : null}
        <div className="subject-hero-chips">
          <span className="subject-hero-chip">
            Lectures <b>{lectures.length}</b>
          </span>
          <span className="subject-hero-chip">
            Assignments <b>{assignments.length}</b>
          </span>
          <span className="subject-hero-chip">
            Assessments <b>{quizzes.length}</b>
          </span>
        </div>
      </div>

      <SubjectTabs
        tabs={subjectTabs(subjectId, {
          lectures: lectures.length,
          assignments: assignments.length,
          assessments: quizzes.length,
        })}
      />

      {lectures.length === 0 ? (
        <EmptyState title="No lectures yet" message="Lectures for this subject will appear here once published." />
      ) : (
        <div className="item-list">
          {lectures.map((lecture) => (
            <LectureCard key={lecture.id} subjectId={subjectId} lecture={lecture} />
          ))}
        </div>
      )}
    </section>
  );
}
