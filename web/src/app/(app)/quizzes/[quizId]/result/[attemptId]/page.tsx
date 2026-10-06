import Link from "next/link";
import type { QuizAttemptResult, Quiz, QuestionForAttempt, AttemptAnswer, SubmitAnswerAck } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";
import { QuizNavigation } from "@/components/quiz/QuizNavigation";

/** Result and saved-answer review. The backend checks ownership for both
 * the aggregate result and the feedback, including for guest sessions. */
export default async function QuizResultPage({ params, searchParams }: {
  params: Promise<{ quizId: string; attemptId: string }>;
  searchParams?: Promise<{ difficulty?: string; lecture?: string }>;
}) {
  const { quizId, attemptId } = await params;
  const filters = await searchParams;
  let result: QuizAttemptResult;
  let quiz: Quiz;
  let questions: QuestionForAttempt[];
  let answers: AttemptAnswer[];
  let feedback: SubmitAnswerAck[];
  try {
    result = (await apiGet<QuizAttemptResult>(`/api/v1/attempts/${attemptId}/result`)).data;
    if (result.quizId !== quizId) throw new ApiError({ error: { code: "not_found", message: "Quiz result not found." } }, 404);
    const [quizRes, questionsRes, answersRes, feedbackRes] = await Promise.all([
      apiGet<Quiz>(`/api/v1/quizzes/${quizId}`),
      apiGet<QuestionForAttempt[]>(`/api/v1/quizzes/${quizId}/questions`),
      apiGet<AttemptAnswer[]>(`/api/v1/attempts/${attemptId}/answers`),
      apiGet<SubmitAnswerAck[]>(`/api/v1/attempts/${attemptId}/feedback`),
    ]);
    quiz = quizRes.data; questions = questionsRes.data; answers = answersRes.data; feedback = feedbackRes.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return <section><QuizNavigation /><NotFoundState message="هذه النتيجة غير متاحة." /></section>;
    if (error instanceof ApiError && error.status === 403) return <section className="state-block">
      <QuizNavigation />
      <p className="state-title">لم يُنهَ الاختبار بعد</p>
      <Link href={`/quizzes/${quizId}/attempt/${attemptId}`} className="btn">متابعة الاختبار</Link>
    </section>;
    return <section><QuizNavigation /><ErrorState message={toSafeErrorMessage(error, "this result").message} retryHref={`/quizzes/${quizId}/result/${attemptId}`} /></section>;
  }
  const difficulty = ["easy", "medium", "hard"].includes(filters?.difficulty ?? "") ? filters!.difficulty! : "all";
  const lecture = questions.some(question => question.lectureId === filters?.lecture) && filters?.lecture ? filters.lecture : "all";
  return <section>
    <h1 className="page-heading">نتيجة الاختبار</h1>
    <QuizAttemptRunner key={attemptId} quiz={quiz} questions={questions} attemptId={attemptId} initialAnswers={answers} initialFeedback={feedback} initialDifficulty={difficulty} initialLecture={lecture} reviewMode />
    <Link href={`/quizzes/${quizId}`} className="btn btn-secondary">العودة إلى الاختبار</Link>
  </section>;
}
