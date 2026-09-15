import type { Quiz, Subject } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { QuizCard } from "@/components/quiz/QuizCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

/**
 * Assessments list for a subject (`GET /api/v1/subjects/:subjectId/assessments`
 * — ASSESSMENT_API.md). Same visibility rule as every other content
 * listing: a draft subject, or one this caller cannot see, 404s — never a
 * distinguishing 403 (SECURITY_ARCHITECTURE.md §13).
 */
export default async function SubjectAssessmentsPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

  let subject: Subject | null = null;
  let quizzes: Quiz[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [subjectRes, quizzesRes] = await Promise.all([
      apiGet<Subject>(`/api/v1/subjects/${subjectId}`),
      apiGet<Quiz[]>(`/api/v1/subjects/${subjectId}/assessments`),
    ]);
    subject = subjectRes.data;
    quizzes = quizzesRes.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "assessments").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}/assessments`} />;
  }

  return (
    <section>
      <Breadcrumbs
        items={[{ label: "Subjects", href: "/subjects" }, { label: subject!.title, href: `/subjects/${subjectId}` }, { label: "Assessments" }]}
      />
      <h1 className="page-heading">Assessments</h1>
      <p className="page-subheading">Quizzes available for {subject!.title}.</p>

      {quizzes.length === 0 ? (
        <EmptyState title="No quizzes yet" message="Quizzes for this subject will appear here once published." />
      ) : (
        <div className="item-list">
          {quizzes.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </div>
      )}
    </section>
  );
}
