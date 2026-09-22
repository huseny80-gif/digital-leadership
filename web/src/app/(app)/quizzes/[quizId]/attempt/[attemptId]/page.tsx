import type { Quiz, QuestionForAttempt, AttemptAnswer } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";

/**
 * The quiz-taking screen. Fetches the quiz and its learner-safe questions
 * server-side (`GET /quizzes/:quizId` and `GET /quizzes/:quizId/questions`
 * — the latter never includes the answer key, see QUIZ_SECURITY.md) and
 * hands them to the client component that manages the actual
 * answer/navigate/submit interaction, since that part genuinely needs
 * client-side state and POST requests a Server Component cannot issue on
 * user interaction (PHASE 09B "Web Routes").
 *
 * `attemptId` itself is not independently re-validated here for the quiz
 * and questions — those are visible to any authenticated user allowed to
 * see the (published) quiz regardless of whose attempt it is, so there is
 * nothing attempt-specific to leak by rendering those; every action the
 * learner takes from here (answer, submit) is re-authorized against the
 * attempt's actual owner by the backend independently (PHASE 09B
 * "Authorization"). The one attempt-specific fetch this page does make —
 * `GET /attempts/:attemptId/answers`, to re-hydrate previously-saved
 * selections on refresh/reopen — IS backend-ownership-checked (404 for
 * another user's attempt), so a failure here is treated the same as the
 * quiz/questions fetch failing, not silently ignored.
 */
export default async function QuizAttemptPage({
  params,
}: {
  params: Promise<{ quizId: string; attemptId: string }>;
}) {
  const { quizId, attemptId } = await params;

  let quiz: Quiz | null = null;
  let questions: QuestionForAttempt[] = [];
  let existingAnswers: AttemptAnswer[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [quizRes, questionsRes, answersRes] = await Promise.all([
      apiGet<Quiz>(`/api/v1/quizzes/${quizId}`),
      apiGet<QuestionForAttempt[]>(`/api/v1/quizzes/${quizId}/questions`),
      apiGet<AttemptAnswer[]>(`/api/v1/attempts/${attemptId}/answers`),
    ]);
    quiz = quizRes.data;
    questions = questionsRes.data;
    existingAnswers = answersRes.data;
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
    return <ErrorState message={errorMessage} retryHref={`/quizzes/${quizId}/attempt/${attemptId}`} />;
  }

  return <QuizAttemptRunner quiz={quiz!} questions={questions} attemptId={attemptId} initialAnswers={existingAnswers} />;
}
