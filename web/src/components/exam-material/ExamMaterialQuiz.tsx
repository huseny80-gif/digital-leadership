"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ExamMaterialAttempt, ExamMaterialDetail, QuizAttempt } from "@shared/index";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { examHref, examRequest } from "./request";
import { ExamGroupTitle } from "./ExamGroupTitle";
import styles from "./examMaterial.module.css";

export function ExamMaterialQuiz({ group }: { group: ExamMaterialDetail }) {
  const query = useSearchParams();
  const attemptId = query.get("attempt");
  const [data, setData] = useState<ExamMaterialAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const endpoint = `/api/exam-material/${group.subjectId}/${group.id}/attempts/`;

  useEffect(() => {
    if (!attemptId) return;
    const controller = new AbortController();
    async function restore() {
      setBusy(true); setError(null);
      try { const bundle = await examRequest<ExamMaterialAttempt>(endpoint + encodeURIComponent(attemptId!), { signal: controller.signal }); if (!controller.signal.aborted) setData(bundle); }
      catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "تعذر استعادة الاختبار."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void restore();
    return () => controller.abort();
  }, [attemptId, endpoint, retry]);

  async function start() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const attempt = await examRequest<QuizAttempt>(`/api/quizzes/${group.quizId}/attempts`, { method: "POST" });
      window.history.replaceState(null, "", examHref(group.subjectId, group.id, "quiz", attempt.id));
      // Refresh even if the same in-progress attempt was already in the URL.
      setRetry(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر بدء الاختبار."); setBusy(false); }
  }
  async function refreshResult(id: string) {
    const bundle = await examRequest<ExamMaterialAttempt>(endpoint + id);
    setData(bundle);
    window.history.replaceState(null, "", examHref(group.subjectId, group.id, "quiz", id));
  }
  async function restarted(attempt: QuizAttempt) {
    const bundle = await examRequest<ExamMaterialAttempt>(endpoint + attempt.id);
    setData(bundle);
    window.history.replaceState(null, "", examHref(group.subjectId, group.id, "quiz", attempt.id));
  }
  const current = data?.attempt.id === attemptId ? data : null;
  if (busy) return <p className={styles.notice} role="status">جارٍ تحميل الاختبار…</p>;
  if (error) return <div className={styles.notice} role="alert"><p>{error}</p><button className={styles.action} onClick={() => attemptId ? setRetry(v => v + 1) : void start()}>إعادة المحاولة</button></div>;
  if (!current) return <div className={styles.quizIntro}>
    <span className={styles.largeIcon}><PlatformIcon name="quiz" /></span>
    <h3>الاختبار التفاعلي المتقدم</h3>
    <p>{group.questionCount} سؤالًا من المحاضرات المختارة، مع تصحيح فوري وتغذية راجعة بعد كل إجابة.</p>
    <p>يمكنك العودة إلى المحاولة ومتابعتها في أي وقت.</p>
    <button className={styles.action} onClick={() => void start()}>بدء الاختبار أو متابعة المحاولة</button>
  </div>;
  return <div className={styles.quiz}>
    {current.result ? <div className={styles.result} role="status" aria-label="نتيجة الاختبار">
      <div className={styles.score}>{Math.round(current.result.percentage)}<small>%</small></div>
      <div><h3>نتيجة الاختبار</h3><p>الإجابات الصحيحة: {current.result.correctAnswers} من {current.result.totalQuestions}</p><p>الأسئلة المجاب عنها: {current.result.answeredQuestions} — الدرجة: {current.result.score}</p></div>
    </div> : null}
    <QuizAttemptRunner key={`${current.attempt.id}:${current.attempt.status}`} quiz={current.quiz} displayTitle={<ExamGroupTitle title={current.quiz.title} />} questions={current.questions} attemptId={current.attempt.id} initialAnswers={current.answers} initialFeedback={current.feedback} startedAt={current.attempt.startedAt} reviewMode={current.attempt.status !== "in_progress"} backHref={examHref(group.subjectId, group.id, "summary")} onFinished={refreshResult} onRestart={restarted} />
  </div>;
}
