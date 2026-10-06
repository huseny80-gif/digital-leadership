import type { Quiz, QuestionForAttempt, AttemptAnswer, QuizAttempt, SubmitAnswerAck } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";
import { QuizNavigation } from "@/components/quiz/QuizNavigation";

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
  let attempt: QuizAttempt | null = null;
  let feedback: SubmitAnswerAck[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [quizRes, questionsRes, answersRes, attemptRes, feedbackRes] = await Promise.all([
      apiGet<Quiz>(`/api/v1/quizzes/${quizId}`),
      apiGet<QuestionForAttempt[]>(`/api/v1/quizzes/${quizId}/questions`),
      apiGet<AttemptAnswer[]>(`/api/v1/attempts/${attemptId}/answers`),
      apiGet<QuizAttempt>(`/api/v1/attempts/${attemptId}`),
      apiGet<SubmitAnswerAck[]>(`/api/v1/attempts/${attemptId}/feedback`),
    ]);
    quiz = quizRes.data;
    questions = questionsRes.data;
    existingAnswers = answersRes.data;
    attempt = attemptRes.data;
    feedback = feedbackRes.data;
    if (attempt.quizId !== quizId) notFound = true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this quiz").message;
    }
  }

  if (notFound) {
    return <section><QuizNavigation /><NotFoundState message="This quiz doesn't exist or is not available." /></section>;
  }

  if (errorMessage) {
    return <section><QuizNavigation quiz={quiz} /><ErrorState message={errorMessage} retryHref={`/quizzes/${quizId}/attempt/${attemptId}`} /></section>;
  }

  return (
    <QuizAttemptRunner
      key={attemptId}
      quiz={quiz!}
      questions={questions}
      attemptId={attemptId}
      initialAnswers={existingAnswers}
      initialFeedback={feedback}
      startedAt={attempt!.startedAt}
      reviewMode={attempt!.status !== "in_progress"}
    />
  );
}
