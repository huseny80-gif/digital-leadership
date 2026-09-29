import type { Quiz } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { StartQuizButton } from "@/components/quiz/StartQuizButton";

/** Quiz detail (`GET /api/v1/quizzes/:quizId`). Shows the quiz's title,
 * description, and a "Start Quiz" action that begins (or resumes) an
 * attempt — the actual attempt-taking UI lives at
 * `/quizzes/:quizId/attempt/:attemptId` (PHASE 09B "Web Routes"). */
export default async function QuizDetailPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;

  let quiz: Quiz | null = null;
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const res = await apiGet<Quiz>(`/api/v1/quizzes/${quizId}`);
    quiz = res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this quiz").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This quiz doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/quizzes/${quizId}`} />;
  }

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: "Subjects", href: "/subjects" },
          { label: quiz!.title },
        ]}
      />
      <h1 className="page-heading">{quiz!.title}</h1>
      {quiz!.description ? <p className="page-subheading">{quiz!.description}</p> : null}
      {quiz!.timeLimitSeconds ? (
        <p className="item-row-meta" style={{ marginBottom: "var(--space-5)" }}>
          Time limit: {Math.round(quiz!.timeLimitSeconds / 60)} minutes
        </p>
      ) : null}

      <StartQuizButton quizId={quizId} />
    </section>
  );
}
