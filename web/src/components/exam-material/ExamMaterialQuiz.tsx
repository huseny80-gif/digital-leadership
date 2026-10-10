"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ExamMaterialAttempt, ExamMaterialDetail, QuizAttempt, ExamExperienceMode } from "@shared/index";
import { examChallengeSeconds, examReadiness } from "@digital-leadership/shared";
import { QuizAttemptRunner } from "@/components/quiz/QuizAttemptRunner";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { examHref, examRequest } from "./request";
import { ExamGroupTitle } from "./ExamGroupTitle";
import { ExamKnowledgeGaps } from "./ExamKnowledgeGaps";
import { ExamChallengeRunner } from "./ExamChallengeRunner";
import styles from "./examMaterial.module.css";

export function ExamMaterialQuiz({ group }: { group: ExamMaterialDetail }) {
  const query = useSearchParams();
  const attemptId = query.get("attempt");
  const [data, setData] = useState<ExamMaterialAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<ExamExperienceMode>("learning");
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
      const attempt = await createAttempt(mode);
      window.history.replaceState(null, "", examHref(group.subjectId, group.id, "quiz", attempt.id));
      // Refresh even if the same in-progress attempt was already in the URL.
      setRetry(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر بدء الاختبار."); setBusy(false); }
  }
  function createAttempt(experience: ExamExperienceMode) {
    return examRequest<QuizAttempt>(endpoint.slice(0, -1), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: experience }) });
  }
  const refreshResult = useCallback(async (id: string) => {
    const bundle = await examRequest<ExamMaterialAttempt>(endpoint + id);
    setData(bundle);
    window.history.replaceState(null, "", examHref(group.subjectId, group.id, "quiz", id));
  }, [endpoint, group.subjectId, group.id]);
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
    <p>{group.questionCount} سؤالًا من المحاضرات المختارة. اختر تجربة المراجعة المناسبة لك.</p>
    <fieldset className={styles.experienceModes}><legend className={styles.srOnly}>وضع الاختبار</legend><label data-selected={mode === "learning"}><input type="radio" name="exam-mode" value="learning" checked={mode === "learning"} onChange={() => setMode("learning")} /><PlatformIcon name="book" /><strong>وضع التعلم</strong><span>تصحيح فوري وتعليل بعد كل سؤال. راجع وتدرّب بالوتيرة التي تناسبك.</span></label><label data-selected={mode === "challenge"}><input type="radio" name="exam-mode" value="challenge" checked={mode === "challenge"} onChange={() => setMode("challenge")} /><PlatformIcon name="clock" /><strong>وضع التحدي</strong><span>محاكاة بوقت محدد ({Math.ceil(examChallengeSeconds(group.questionCount) / 60)} دقيقة)، مع التقييم والتصحيح عند النهاية.</span></label></fieldset>
    <p>تُحفظ محاولة مستقلة لكل وضع؛ يبدأ وقت التحدي عند الضغط على بدء الاختبار.</p>
    <button className={styles.action} onClick={() => void start()}>بدء الاختبار أو متابعة المحاولة</button>
  </div>;
  return <div className={styles.quiz}>
    {current.result ? <div className={styles.result} role="status" aria-label="نتيجة الاختبار">
      <div className={styles.score}>{Math.round(current.result.percentage)}<small>%</small></div>
      <div><h3>نتيجة الاختبار</h3><p>الإجابات الصحيحة: {current.result.correctAnswers} من {current.result.totalQuestions}</p><p>الأسئلة المجاب عنها: {current.result.answeredQuestions} — الدرجة: {current.result.score}</p></div>
    </div> : null}
    {current.result && current.attempt.mode === "challenge" ? <div className={styles.readiness} data-tone={examReadiness(current.result.percentage).tone}><h4>{examReadiness(current.result.percentage).label}</h4><p>{examReadiness(current.result.percentage).advice}</p><small>تقدير تدريبي مبني على نتيجة هذه المحاولة، وليس ضمانًا لنتيجة الامتحان الرسمي.</small><button type="button" className={styles.quiet} onClick={() => window.history.replaceState(null, "", examHref(group.subjectId, group.id, "quiz"))}>اختيار وضع آخر</button></div> : null}
    {current.knowledgeGaps && current.attempt.status === "graded" ? <ExamKnowledgeGaps report={current.knowledgeGaps} subjectId={group.subjectId} /> : null}
    {current.attempt.mode === "challenge" && current.attempt.status === "in_progress" ? <ExamChallengeRunner key={current.attempt.id} bundle={current} onFinished={refreshResult} onLeave={() => window.history.replaceState(null, "", examHref(group.subjectId, group.id, "quiz"))} /> : <QuizAttemptRunner key={`${current.attempt.id}:${current.attempt.status}`} quiz={current.quiz} displayTitle={<ExamGroupTitle title={current.quiz.title} />} questions={current.questions} attemptId={current.attempt.id} initialAnswers={current.answers} initialFeedback={current.feedback} startedAt={current.attempt.startedAt} reviewMode={current.attempt.status !== "in_progress"} backHref={examHref(group.subjectId, group.id, "summary")} onFinished={refreshResult} onRestart={restarted} startAttempt={() => createAttempt(current.attempt.mode ?? "learning")} />}
  </div>;
}
