"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ExamMaterialAttempt } from "@shared/index";
import { readQuizDraft, writeQuizDraft, type AnswerState } from "@/components/quiz/quizDraft";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { answerSignature, challengeInitialState, challengeReducer, completeChallengeAnswer } from "./challengeState";
import styles from "./examMaterial.module.css";

/** All formats share the same authenticated grading API, but challenge
 * acknowledgements deliberately contain no correction until final submission. */
export function ExamChallengeRunner({ bundle, onFinished, onLeave }: { bundle: ExamMaterialAttempt; onFinished: (id: string) => Promise<void>; onLeave: () => void }) {
  const { attempt, questions } = bundle;
  const [state, dispatch] = useReducer(challengeReducer, bundle.answers, challengeInitialState);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [retry, setRetry] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const restored = useRef(false);
  const latest = useRef(state);
  const saved = useRef(state.saved);
  const offset = useRef(0);
  const active = useRef(true);
  const operation = useRef<Promise<boolean> | null>(null);
  const submission = useRef(false);
  const finishing = useRef(false);
  const request = useRef<AbortController | null>(null);
  const deadline = attempt.deadlineAt ? new Date(attempt.deadlineAt).getTime() : 0;
  const question = questions[state.currentIndex];
  const answer = question ? state.answers[question.id] : undefined;
  const timeExpired = remaining === 0;
  const locked = submitting || timeExpired || remaining === null;

  useEffect(() => { latest.current = state; }, [state]);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const restore = () => {
      if (!active.current) return;
      const draft = readQuizDraft(attempt.id, bundle.quiz.id, questions);
      if (draft) dispatch({ type: "restore", answers: draft.answers, index: Math.max(0, questions.findIndex(question => question.id === draft.questionId)) });
      setDraftReady(true);
    };
    queueMicrotask(restore);
  }, [attempt.id, bundle.quiz.id, questions]);
  useEffect(() => {
    if (!draftReady || submitting) return;
    writeQuizDraft(attempt.id, { quizId: bundle.quiz.id, answers: Object.fromEntries(Object.entries(state.answers).filter(([id, answer]) => state.saved[id] !== answerSignature(answer))), questionId: questions[state.currentIndex]?.id, difficulty: "all", lecture: "all" });
  }, [draftReady, submitting, attempt.id, bundle.quiz.id, questions, state.answers, state.saved, state.currentIndex]);
  useEffect(() => {
    active.current = true;
    offset.current = bundle.serverTime ? new Date(bundle.serverTime).getTime() - Date.now() : 0;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - (Date.now() + offset.current)) / 1000)));
    tick(); const interval = window.setInterval(tick, 1000);
    return () => { active.current = false; window.clearInterval(interval); request.current?.abort(); };
  }, [deadline, bundle.serverTime]);

  const saveDirty = useCallback(async (): Promise<boolean> => {
    if (operation.current) return operation.current;
    const work = async () => {
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of questions) {
          if (!active.current || submission.current || Date.now() + offset.current >= deadline) return true;
          const response = completeChallengeAnswer(item, latest.current.answers[item.id]);
          if (!response || saved.current[item.id] === answerSignature(response)) continue;
          const signature = answerSignature(response);
          dispatch({ type: "saving", id: item.id });
          const controller = new AbortController(); request.current = controller;
          try {
            const result = await fetch(`/api/attempts/${attempt.id}/answers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: item.id, ...response }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
            if (result.status === 409) { if (active.current) await onFinished(attempt.id); return true; }
            const body = await result.json();
            if (!result.ok || !body.data?.recorded || body.data.questionId !== item.id) throw new Error("Answer not saved");
            saved.current[item.id] = signature;
            changed = true;
            if (active.current) dispatch({ type: "saved", id: item.id, signature });
          } catch {
            if (active.current) dispatch({ type: "failed", message: "تعذر حفظ إحدى الإجابات. أعد الحفظ قبل انتهاء الوقت؛ تبقى الإجابات المسجلة محفوظة." });
            return false;
          } finally { if (request.current === controller) request.current = null; }
        }
      }
      return true;
    };
    const promise = work(); operation.current = promise;
    try { return await promise; } finally { if (operation.current === promise) operation.current = null; }
  }, [questions, deadline, attempt.id, onFinished]);

  useEffect(() => {
    if (!draftReady || submitting || timeExpired) return;
    const timer = window.setTimeout(() => { void saveDirty(); }, 500);
    return () => window.clearTimeout(timer);
  }, [draftReady, state.answers, retry, submitting, timeExpired, saveDirty]);

  const finish = useCallback(async (expired = false) => {
    if (finishing.current) return;
    finishing.current = true; setSubmitting(true);
    setSubmitError(null); setConfirmFinish(false);
    let completed = false;
    try {
      // Freeze editing while waiting for an already-started save, then flush
      // only while time remains. Late drafts cannot inflate the final score.
      if (operation.current) await operation.current;
      if (!active.current) return;
      if (!expired && questions.some(item => saved.current[item.id] && latest.current.answers[item.id] && !completeChallengeAnswer(item, latest.current.answers[item.id]))) {
        setSubmitError("إحدى الإجابات المعدّلة غير مكتملة. أكملها قبل التسليم؛ يبقى آخر رد محفوظ هو المعتمد عند انتهاء الوقت."); return;
      }
      if (!expired && Date.now() + offset.current < deadline && !await saveDirty()) return;
      if (!active.current) return;
      submission.current = true;
      const response = await fetch(`/api/attempts/${attempt.id}/submit`, { method: "POST", signal: AbortSignal.timeout(20_000) });
      if (!response.ok && response.status !== 409) throw new Error("Submission failed");
      if (active.current) await onFinished(attempt.id);
      completed = true;
    } catch {
      if (active.current) setSubmitError("تعذر عرض النتيجة. أعد التسليم؛ تبقى الإجابات المحفوظة والموعد النهائي كما هما.");
    } finally {
      if (!completed) { finishing.current = false; submission.current = false; if (active.current) setSubmitting(false); }
    }
  }, [attempt.id, deadline, onFinished, saveDirty, questions]);

  useEffect(() => {
    if (remaining !== 0 || submitError) return;
    const timeout = window.setTimeout(() => { void finish(true); }, 0);
    return () => window.clearTimeout(timeout);
  }, [remaining, finish, submitError]);
  const answered = questions.filter(item => completeChallengeAnswer(item, state.answers[item.id])).length;
  const savedCount = Object.keys(state.saved).length;
  const pendingEdits = Object.entries(state.answers).filter(([id, answer]) => state.saved[id] !== answerSignature(answer)).length;
  function edit(value: AnswerState) { if (question && !locked) dispatch({ type: "edit", id: question.id, answer: value }); }
  function moveOrder(id: string, direction: -1 | 1) {
    if (!question?.orderItems) return;
    const order = answer?.orderAnswer ?? question.orderItems.map(item => item.id), next = [...order];
    const from = next.indexOf(id), to = from + direction;
    if (to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to]!, next[from]!]; edit({ orderAnswer: next });
  }
  const minutes = remaining === null ? "--" : String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = remaining === null ? "--" : String(remaining % 60).padStart(2, "0");
  return <section className={styles.challenge} aria-label="محاكاة الامتحان">
    <div className={styles.challengeHead}><div><span className={styles.eyebrow}>وضع التحدي · محاكاة الامتحان</span><h3>اختبر جاهزيتك</h3></div><div className={styles.countdown} data-urgent={remaining !== null && remaining <= 60}><PlatformIcon name="clock" /><time aria-label="الوقت المتبقي" dir="ltr">{minutes}:{seconds}</time></div></div>
    <p className={styles.muted}>تُحفظ الإجابات المكتملة تلقائياً. يمكنك تعديلها حتى التسليم؛ يظهر التصحيح والتعليل عند النهاية.</p>
    <div className={styles.challengeProgress}><span>أجبت عن {answered} / {questions.length}</span><span role="status">{state.savingId ? "جارٍ حفظ الإجابة…" : pendingEdits ? `${pendingEdits} تعديل بانتظار الحفظ` : `حُفظت ${savedCount} إجابة`}</span><progress value={answered} max={questions.length} /></div>
    <nav className={styles.questionPalette} aria-label="الانتقال بين أسئلة التحدي">{questions.map((item, index) => <button type="button" key={item.id} aria-label={`السؤال ${index + 1}${state.saved[item.id] ? "، محفوظ" : ""}`} aria-current={state.currentIndex === index ? "step" : undefined} data-answered={Boolean(completeChallengeAnswer(item, state.answers[item.id]))} disabled={submitting} onClick={() => dispatch({ type: "select", index })}>{index + 1}</button>)}</nav>
    {question ? <div className="finquiz-training"><div className="quiz-body">
      {question.lectureTitle ? <p className={styles.eyebrow}>{question.lectureTitle}</p> : null}<h4 className="challenge-prompt">{question.prompt}</h4>
      {question.options ? <div className="opt-list">{question.options.map((option, index) => <button type="button" className="opt" key={option.id} aria-pressed={answer?.selectedOptionId === option.id} disabled={locked} onClick={() => edit({ selectedOptionId: option.id })}><span className="let">{"أبجدهو"[index] ?? index + 1}</span><span>{option.optionText}</span></button>)}</div>
        : question.matchItems ? <div className="match-question">{question.matchItems.left.map(item => <label className="match-row" key={item.id}><span>{item.text}</span><select aria-label={`مطابقة ${item.text}`} disabled={locked} value={answer?.matchAnswer?.find(pair => pair.leftId === item.id)?.rightId ?? ""} onChange={event => { const next = (answer?.matchAnswer ?? []).filter(pair => pair.leftId !== item.id); if (event.target.value) next.push({ leftId: item.id, rightId: event.target.value }); edit({ matchAnswer: next }); }}><option value="">اختر المطابقة</option>{question.matchItems!.right.map(right => <option key={right.id} value={right.id}>{right.text}</option>)}</select></label>)}</div>
          : question.orderItems ? <div><ol className="order-list">{(answer?.orderAnswer ?? question.orderItems.map(item => item.id)).map((id, index, order) => <li className="order-row" key={id}><span>{question.orderItems!.find(item => item.id === id)?.text}</span><button type="button" className="order-move" aria-label={`رفع العنصر ${index + 1}`} disabled={locked || index === 0} onClick={() => moveOrder(id, -1)}>↑</button><button type="button" className="order-move" aria-label={`خفض العنصر ${index + 1}`} disabled={locked || index === order.length - 1} onClick={() => moveOrder(id, 1)}>↓</button></li>)}</ol><button type="button" className={styles.quiet} disabled={locked} onClick={() => edit({ orderAnswer: answer?.orderAnswer ?? question.orderItems!.map(item => item.id) })}>اعتماد ترتيب العناصر الحالي</button></div>
            : <label className={styles.challengeText}>إجابتك<textarea aria-label="إجابتك" disabled={locked} maxLength={20000} value={answer?.answerText ?? ""} onChange={event => edit({ answerText: event.target.value })} /></label>}
    </div></div> : null}
    {state.saveError ? <div className={styles.error} role="alert"><p>{state.saveError}</p><button type="button" className={styles.quiet} disabled={locked} onClick={() => setRetry(value => value + 1)}>إعادة حفظ الإجابات</button></div> : null}
    <div className={styles.challengeFooter}><div><button type="button" className={styles.quiet} disabled={submitting || state.currentIndex === 0} onClick={() => dispatch({ type: "select", index: state.currentIndex - 1 })}>السؤال السابق</button><button type="button" className={styles.quiet} disabled={submitting || state.currentIndex >= questions.length - 1} onClick={() => dispatch({ type: "select", index: state.currentIndex + 1 })}>السؤال التالي</button></div><button type="button" className={styles.action} disabled={submitting} onClick={() => timeExpired ? void finish(true) : setConfirmFinish(true)}>{submitting ? "جارٍ تسليم التحدي…" : "تسليم التحدي"}</button></div>
    {confirmFinish ? <div className={styles.confirmFinish} role="alert"><p>أجبت عن {answered} من {questions.length} سؤالًا. هل ترغب في تسليم المحاولة وعرض النتيجة؟</p><button type="button" className={styles.action} onClick={() => void finish()}>نعم، تسليم المحاولة</button><button type="button" className={styles.quiet} onClick={() => setConfirmFinish(false)}>متابعة الإجابة</button></div> : null}
    {submitError ? <p className={styles.error} role="alert">{submitError}</p> : null}
    {timeExpired ? <p className={styles.notice} role="status">انتهى الوقت. يتم تقييم الإجابات المحفوظة تلقائياً.</p> : null}
    {remaining !== null && remaining <= 60 && remaining > 0 ? <p className={styles.timerWarning} role="status">تبقت أقل من دقيقة؛ تأكد من حفظ إجاباتك.</p> : null}
    <button type="button" className={styles.sourceLink} disabled={submitting} onClick={onLeave}>العودة إلى خيارات الاختبار</button><p className={styles.muted}>يستمر وقت التحدي عند مغادرة الصفحة أو تحديثها.</p>
  </section>;
}
