"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quiz, QuestionForAttempt, SubmitAnswerAck, AttemptAnswer, QuizAttempt } from "@shared/index";
import { QuizNavigation } from "./QuizNavigation";
import { readQuizDraft, writeQuizDraft, type AnswerState } from "./quizDraft";
import { notifyLearningProgress } from "@/lib/learning";

const levels = [{ id: "all", label: "الكل" }, { id: "easy", label: "سهل" }, { id: "medium", label: "متوسط" }, { id: "hard", label: "صعب" }];
const letters = ["أ", "ب", "ج", "د", "هـ", "و"];

function toInitialAnswers(initialAnswers: AttemptAnswer[]): Record<string, AnswerState> {
  return Object.fromEntries(initialAnswers.map(answer => [answer.questionId, {
    ...(answer.selectedOptionId !== null ? { selectedOptionId: answer.selectedOptionId } : {}),
    ...(answer.answerText !== null ? { answerText: answer.answerText } : {}),
    ...(answer.matchAnswer !== null ? { matchAnswer: answer.matchAnswer } : {}),
    ...(answer.orderAnswer !== null ? { orderAnswer: answer.orderAnswer } : {}),
  }]));
}

function completeAnswer(question: QuestionForAttempt, answer?: AnswerState): AnswerState | null {
  if (question.options) return answer?.selectedOptionId ? { selectedOptionId: answer.selectedOptionId } : null;
  if (question.matchItems) {
    const pairs = answer?.matchAnswer;
    return pairs && question.matchItems.left.every(item => pairs.some(pair => pair.leftId === item.id && question.matchItems!.right.some(right => right.id === pair.rightId))) ? { matchAnswer: pairs } : null;
  }
  // The initial shuffled order is a valid response even without a move.
  if (question.orderItems) return { orderAnswer: answer?.orderAnswer ?? question.orderItems.map(item => item.id) };
  return answer?.answerText?.trim() ? { answerText: answer.answerText } : null;
}

function QuestionFeedback({ feedback, open }: { feedback: SubmitAnswerAck; open: boolean }) {
  const tone = open || feedback.isCorrect == null ? "info" : feedback.isCorrect ? "ok" : "bad";
  const rubric = feedback.answerReview?.rubric;
  return (
    <div className={`feedback ${tone} show`} role="status" aria-live="polite">
      <div className="fb-title">{open ? "📋 معايير الإجابة النموذجية" : feedback.isCorrect == null ? "تم تسجيل إجابتك" : feedback.isCorrect ? "✓ إجابة صحيحة" : "✕ إجابة غير صحيحة"}</div>
      {open && rubric?.length ? (
        <ol className="detail-list">
          {rubric.map((point, index) => <li key={index}>{point.text}{point.keywords.length > 0 ? <span className="kw-hint"> ({point.keywords.join("، ")})</span> : null}</li>)}
        </ol>
      ) : feedback.correctAnswerSummary ? (
        <div className="fb-answer"><strong>{open ? "الإجابة النموذجية" : "الإجابة الصحيحة"}:</strong> {feedback.correctAnswerSummary}</div>
      ) : null}
      {feedback.feedback ? <div className="fb-explanation"><strong>التوضيح والتغذية الراجعة:</strong> {feedback.feedback}</div> : null}
      {open ? <p className="self-review-note">قارن إجابتك بهذه المعايير للمراجعة الذاتية؛ لا تُحتسب الأسئلة المقالية والسيناريوهات ضمن التصحيح الآلي.</p> : null}
    </div>
  );
}

/** Finquiz's one-question, select → check → explanation interaction.
 * Answers are graded and persisted by the existing authenticated API.
 * No answer key or rubric is present in the initial question payload. */
export function QuizAttemptRunner({
  quiz, questions, attemptId, initialAnswers = [], initialFeedback = [], startedAt,
  apiBasePath = "/api", routeBasePath = "/quizzes", reviewMode = false,
  initialDifficulty = "all", initialLecture = "all",
}: {
  quiz: Quiz;
  questions: QuestionForAttempt[];
  attemptId: string;
  initialAnswers?: AttemptAnswer[];
  initialFeedback?: SubmitAnswerAck[];
  startedAt?: string;
  apiBasePath?: string;
  routeBasePath?: string;
  reviewMode?: boolean;
  initialDifficulty?: string;
  initialLecture?: string;
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [lecture, setLecture] = useState(initialLecture);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => toInitialAnswers(initialAnswers));
  const [studyFeedback, setStudyFeedback] = useState<Record<string, SubmitAnswerAck>>(() => Object.fromEntries(initialFeedback.filter(feedback => initialAnswers.some(answer => answer.questionId === feedback.questionId)).map(feedback => [feedback.questionId, feedback])));
  const [revealedModels, setRevealedModels] = useState<Record<string, boolean>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const operationInFlight = useRef(false);
  const autoSubmitted = useRef(false);
  const restoredDraftAttempt = useRef<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const deadline = !reviewMode && quiz.timeLimitSeconds && startedAt ? new Date(startedAt).getTime() + quiz.timeLimitSeconds * 1000 : null;
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(deadline !== null ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null);

  useEffect(() => {
    if (reviewMode || restoredDraftAttempt.current === attemptId) return;
    restoredDraftAttempt.current = attemptId;
    const draft = readQuizDraft(attemptId, quiz.id, questions);
    if (draft) {
      // Restore tab-local input after hydration; the server's recorded
      // answers override drafts, and drafts never unlock model answers.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnswers({ ...draft.answers, ...toInitialAnswers(initialAnswers) });
      setDifficulty(draft.difficulty);
      setLecture(draft.lecture);
      const visible = questions.filter(item => (draft.difficulty === "all" || (item.difficulty ?? "medium") === draft.difficulty) && (draft.lecture === "all" || item.lectureId === draft.lecture));
      setCurrentIndex(Math.max(0, visible.findIndex(item => item.id === draft.questionId)));
    }
    setDraftReady(true);
  }, [attemptId, quiz.id, questions, initialAnswers, reviewMode]);

  useEffect(() => {
    if (!draftReady || reviewMode) return;
    const visible = questions.filter(item => (difficulty === "all" || (item.difficulty ?? "medium") === difficulty) && (lecture === "all" || item.lectureId === lecture));
    writeQuizDraft(attemptId, {
      quizId: quiz.id,
      answers: Object.fromEntries(Object.entries(answers).filter(([id]) => !studyFeedback[id])),
      questionId: visible[currentIndex]?.id, difficulty, lecture,
    });
  }, [draftReady, reviewMode, attemptId, quiz.id, questions, answers, studyFeedback, currentIndex, difficulty, lecture]);

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [deadline]);

  useEffect(() => {
    if (draftReady && remainingSeconds === 0 && !autoSubmitted.current && !operationInFlight.current) {
      autoSubmitted.current = true;
      void handleSubmit();
    }
    // Re-evaluate on completion of a check if the timer expired mid-request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, remainingSeconds, savingQuestionId]);

  const filteredQuestions = questions.filter(question => (difficulty === "all" || (question.difficulty ?? "medium") === difficulty) && (lecture === "all" || question.lectureId === lecture));
  const question = filteredQuestions[currentIndex];
  const currentAnswer = question ? answers[question.id] : undefined;
  const feedback = question ? studyFeedback[question.id] : undefined;
  const isOpen = question?.questionType === "open";
  const isBusy = savingQuestionId !== null || submitting || restarting;
  const locked = reviewMode || Boolean(feedback) || isBusy;
  const answeredCount = filteredQuestions.filter(item => answers[item.id] && completeAnswer(item, answers[item.id])).length;
  const automaticQuestions = filteredQuestions.filter(item => item.questionType !== "open" && item.questionType !== "short_answer");
  const automaticCorrect = automaticQuestions.filter(item => studyFeedback[item.id]?.isCorrect === true).length;
  const automaticWrong = automaticQuestions.filter(item => studyFeedback[item.id]?.isCorrect === false).length;
  const lectures = Array.from(new Map(questions.filter(item => item.lectureId).map(item => [item.lectureId!, { id: item.lectureId!, number: item.lectureNumber, title: item.lectureTitle }])).values()).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  function changeFilter(kind: "difficulty" | "lecture", value: string) {
    if (kind === "difficulty") setDifficulty(value); else setLecture(value);
    setCurrentIndex(0);
    setSaveError(null);
  }

  function updateAnswer(answer: AnswerState) {
    if (!question || locked) return;
    setAnswers(previous => ({ ...previous, [question.id]: answer }));
    setSaveError(null);
  }

  async function saveAnswer(questionId: string, answer: AnswerState): Promise<SubmitAnswerAck | null> {
    setSavingQuestionId(questionId);
    setSaveError(null);
    try {
      const response = await fetch(`${apiBasePath}/attempts/${attemptId}/answers`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId, ...answer }),
      });
      const body = await response.json() as { data?: SubmitAnswerAck };
      if (response.status === 409) {
        router.push(`${routeBasePath}/${quiz.id}/result/${attemptId}`);
        return null;
      }
      if (!response.ok || !body.data?.recorded || body.data.questionId !== questionId) throw new Error("Answer not recorded");
      setStudyFeedback(previous => ({ ...previous, [questionId]: body.data! }));
      return body.data;
    } catch {
      setSaveError("تعذر التحقق من إجابتك وحفظها. حاول مرة أخرى.");
      return null;
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function checkAnswer() {
    if (!question || operationInFlight.current) return;
    if (feedback) {
      if (isOpen) setRevealedModels(previous => ({ ...previous, [question.id]: true }));
      return;
    }
    const answer = completeAnswer(question, currentAnswer);
    if (!answer) {
      setSaveError(question.matchItems ? "أكمل جميع المطابقات أولاً." : question.options ? "اختر إجابة أولاً." : "اكتب إجابتك أولاً.");
      return;
    }
    operationInFlight.current = true;
    setAnswers(previous => ({ ...previous, [question.id]: answer }));
    const recorded = await saveAnswer(question.id, answer);
    if (recorded && isOpen) setRevealedModels(previous => ({ ...previous, [question.id]: true }));
    operationInFlight.current = false;
  }

  function moveOrderItem(itemId: string, direction: -1 | 1) {
    if (!question?.orderItems || locked) return;
    const order = currentAnswer?.orderAnswer ?? question.orderItems.map(item => item.id);
    const index = order.indexOf(itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateAnswer({ orderAnswer: next });
  }

  async function handleSubmit() {
    if (operationInFlight.current || reviewMode) return;
    operationInFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    let finished = false;
    try {
      // Record complete draft responses before finalization. A failed save
      // keeps the attempt open instead of silently losing a learner's work.
      for (const item of questions) {
        if (studyFeedback[item.id]) continue;
        const answer = completeAnswer(item, answers[item.id]);
        // Unvisited ordering questions are not silently treated as answered.
        if (!answer || (!answers[item.id] && item.questionType === "order")) continue;
        if (!await saveAnswer(item.id, answer)) throw new Error("Unsaved answer");
      }
      const response = await fetch(`${apiBasePath}/attempts/${attemptId}/submit`, { method: "POST" });
      await response.json();
      if (!response.ok && response.status !== 409) throw new Error("Submit failed");
      notifyLearningProgress();
      finished = true;
      const filters = new URLSearchParams();
      if (difficulty !== "all") filters.set("difficulty", difficulty);
      if (lecture !== "all") filters.set("lecture", lecture);
      router.push(`${routeBasePath}/${quiz.id}/result/${attemptId}${filters.size ? `?${filters}` : ""}`);
    } catch {
      setSubmitError("تعذر إنهاء الاختبار. إجاباتك المحفوظة متاحة؛ حاول مرة أخرى.");
    } finally {
      if (!finished) { operationInFlight.current = false; setSubmitting(false); }
    }
  }

  async function restartQuiz() {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setRestarting(true);
    setSubmitError(null);
    let navigated = false;
    try {
      // Preserve the previous recorded attempt, then start a fresh one.
      if (!reviewMode) {
        const finished = await fetch(`${apiBasePath}/attempts/${attemptId}/submit`, { method: "POST" });
        if (!finished.ok && finished.status !== 409) throw new Error("Restart failed");
      }
      const response = await fetch(`${apiBasePath}/quizzes/${quiz.id}/attempts`, { method: "POST" });
      const body = await response.json() as { data?: QuizAttempt };
      if (!response.ok || !body.data?.id) throw new Error("Restart failed");
      navigated = true;
      router.push(`${routeBasePath}/${quiz.id}/attempt/${body.data.id}`);
    } catch {
      setSubmitError("تعذر بدء محاولة جديدة. حاول مرة أخرى.");
    } finally {
      if (!navigated) { operationInFlight.current = false; setRestarting(false); }
    }
  }

  if (questions.length === 0) return <section><QuizNavigation quiz={quiz} backHref={`${routeBasePath}/${quiz.id}`} /><div className="state-block"><p className="state-title">لا توجد أسئلة في هذا الاختبار</p></div></section>;

  return (
    <section className="finquiz-training" aria-label={reviewMode ? "مراجعة الإجابات" : "الاختبار التفاعلي"}>
      <QuizNavigation quiz={quiz} backHref={`${routeBasePath}/${quiz.id}`} />
      <div className="quiz-head">
        {reviewMode ? <h2>مراجعة الإجابات — {quiz.title}</h2> : <h1>{quiz.title}</h1>}
        {quiz.description ? <p>{quiz.description}</p> : null}
        {remainingSeconds !== null ? <p role="timer" aria-live={remainingSeconds <= 60 ? "polite" : "off"}>الوقت المتبقي: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</p> : null}
      </div>
      {lectures.length > 1 ? <div className="quiz-toolbar" role="group" aria-label="تصفية حسب المحاضرة">
        <span className="label">تصفية حسب المحاضرة:</span>
        <button className="filter-btn" type="button" aria-pressed={lecture === "all"} onClick={() => changeFilter("lecture", "all")} disabled={isBusy}>الكل</button>
        {lectures.map(item => <button className="filter-btn" key={item.id} type="button" title={item.title} aria-pressed={lecture === item.id} onClick={() => changeFilter("lecture", item.id)} disabled={isBusy}>المحاضرة {item.number ?? item.title}</button>)}
      </div> : null}
      <div className="quiz-toolbar" role="group" aria-label="تصفية حسب الصعوبة">
        <span className="label">تصفية حسب الصعوبة:</span>
        {levels.map(level => <button className="filter-btn" key={level.id} type="button" aria-pressed={difficulty === level.id} onClick={() => changeFilter("difficulty", level.id)} disabled={isBusy}>{level.label}</button>)}
        <span className="label quiz-count">عدد الأسئلة: {filteredQuestions.length}</span>
        {!reviewMode ? <button type="button" className="filter-btn" onClick={restartQuiz} disabled={isBusy}>🗑 مسح التقدم</button> : null}
      </div>
      <div className="quiz-progress">
        <div className="progress-meta" role="status" aria-live="polite">
          <span>التقدّم: {answeredCount}/{filteredQuestions.length}</span><span>النتيجة: {automaticCorrect}/{filteredQuestions.length}</span>
        </div>
        <div className="progress-track" role="progressbar" aria-label="التقدّم" aria-valuemin={0} aria-valuemax={100} aria-valuenow={filteredQuestions.length ? Math.round(answeredCount / filteredQuestions.length * 100) : 0}>
          <div className="progress-fill" style={{ width: `${filteredQuestions.length ? answeredCount / filteredQuestions.length * 100 : 0}%` }} />
        </div>
      </div>
      <div className="quiz-body">
        {question ? <>
          <div className="q-prompt">
            <span className="qnum">سؤال {currentIndex + 1}/{filteredQuestions.length}</span>
            <span className={`badge badge-${question.difficulty ?? "medium"}`}>{levels.find(level => level.id === (question.difficulty ?? "medium"))?.label}</span>
            {isOpen ? <span className="badge badge-type" title={question.kind}>سؤال مفتوح</span> : null}
            <h2 id={`prompt-${question.id}`}>{question.prompt}</h2>
          </div>
          <div aria-labelledby={`prompt-${question.id}`}>
            {question.options ? <div className="opt-list" role="group" aria-label={question.questionType === "true_false" ? "صح أو خطأ" : "خيارات الإجابة"}>
              {question.options.map((option, index) => {
                const selected = currentAnswer?.selectedOptionId === option.id;
                const correct = Boolean(feedback?.answerReview?.correctOptionIds?.includes(option.id)) || (selected && feedback?.isCorrect === true);
                const wrong = selected && feedback?.isCorrect === false;
                return <button key={option.id} type="button" className={`opt${correct ? " is-correct" : wrong ? " is-wrong" : ""}`} aria-pressed={selected} disabled={locked} onClick={() => updateAnswer({ selectedOptionId: option.id })}>
                  <span className="let" aria-hidden="true">{letters[index] ?? index + 1}</span><span>{option.optionText}</span>{correct || wrong ? <span className="mark" aria-label={correct ? "الإجابة الصحيحة" : "اختيار غير صحيح"}>{correct ? "✓" : "✕"}</span> : null}
                </button>;
              })}
            </div> : question.matchItems ? <>
              <p className="question-hint">اختر ما يقابل كل عنصر من القائمة.</p>
              {question.matchItems.left.map(left => {
                const selected = currentAnswer?.matchAnswer?.find(pair => pair.leftId === left.id)?.rightId ?? "";
                const correct = feedback?.answerReview?.correctMatches?.find(pair => pair.leftId === left.id)?.rightId;
                const tone = feedback && correct ? correct === selected ? " is-correct" : " is-wrong" : "";
                return <div className={`match-row${tone}`} key={left.id}>
                  <label className="match-left" htmlFor={`match-${question.id}-${left.id}`}>{left.text}</label>
                  <select className="match-select" id={`match-${question.id}-${left.id}`} value={selected} disabled={locked} onChange={event => updateAnswer({ matchAnswer: [...(currentAnswer?.matchAnswer ?? []).filter(pair => pair.leftId !== left.id), { leftId: left.id, rightId: event.target.value }] })}>
                    <option value="">اختر…</option>{question.matchItems!.right.map(right => <option key={right.id} value={right.id}>{right.text}</option>)}
                  </select>
                  {tone ? <span className="mark" aria-label={correct === selected ? "مطابقة صحيحة" : "مطابقة غير صحيحة"}>{correct === selected ? "✓" : "✕"}</span> : null}
                </div>;
              })}
            </> : question.orderItems ? <>
              <p className="question-hint">رتّب العناصر بالترتيب الصحيح باستخدام أزرار التحريك.</p>
              <ol className="order-list">{(currentAnswer?.orderAnswer ?? question.orderItems.map(item => item.id)).map((itemId, index, list) => {
                const item = question.orderItems!.find(candidate => candidate.id === itemId);
                if (!item) return null;
                const correctOrder = feedback?.answerReview?.correctOrder;
                const tone = correctOrder ? correctOrder[index] === itemId ? " is-correct" : " is-wrong" : "";
                return <li className={`order-item${tone}`} key={item.id}>
                  <span className="pos" aria-hidden="true">{index + 1}</span><span className="txt">{item.text}</span>
                  <span className="order-btns"><button className="icon-btn" type="button" aria-label={`تحريك لأعلى: ${item.text}`} disabled={locked || index === 0} onClick={() => moveOrderItem(item.id, -1)}>▲</button><button className="icon-btn" type="button" aria-label={`تحريك لأسفل: ${item.text}`} disabled={locked || index === list.length - 1} onClick={() => moveOrderItem(item.id, 1)}>▼</button></span>
                </li>;
              })}</ol>
            </> : <>
              <label className="sr-only" htmlFor={`answer-${question.id}`}>إجابتك</label>
              {question.questionType === "fill" ? <input id={`answer-${question.id}`} className="fill-input" type="text" autoComplete="off" placeholder="اكتب الإجابة هنا" value={currentAnswer?.answerText ?? ""} disabled={locked} maxLength={5000} onChange={event => updateAnswer({ answerText: event.target.value })} /> : <textarea id={`answer-${question.id}`} className="open-input" rows={5} autoComplete="off" placeholder="اكتب إجابتك هنا للمراجعة الذاتية…" value={currentAnswer?.answerText ?? ""} disabled={locked} maxLength={5000} onChange={event => updateAnswer({ answerText: event.target.value })} />}
            </>}
          </div>
          {savingQuestionId === question.id ? <div className="feedback info show" role="status">⏳ جارٍ التحقق...</div> : feedback && (!isOpen || revealedModels[question.id]) ? <QuestionFeedback feedback={feedback} open={isOpen} /> : null}
          {reviewMode && !feedback ? <p className="question-hint">لم تُسجّل إجابة عن هذا السؤال في هذه المحاولة.</p> : null}
          {saveError ? <p className="quiz-error" role="alert">{saveError}</p> : null}
        </> : <p className="empty-state" role="status">لا توجد أسئلة في هذا المستوى أو المحاضرة.</p>}
      </div>
      <div className="quiz-foot">
        <button className="btn btn-secondary" type="button" onClick={() => { setCurrentIndex(index => Math.max(0, index - 1)); setSaveError(null); }} disabled={isBusy || currentIndex === 0 || !question}>→ السؤال السابق</button>
        {question && (!reviewMode || isOpen && feedback) ? <button className="btn" type="button" onClick={checkAnswer} disabled={isBusy || Boolean(feedback) && (!isOpen || Boolean(revealedModels[question.id]))}>{savingQuestionId ? "جارٍ التحقق..." : isOpen ? "عرض الإجابة النموذجية" : "تحقق من الإجابة"}</button> : null}
        <span className="spacer" />
        {currentIndex < filteredQuestions.length - 1 ? <button className="btn" type="button" disabled={isBusy} onClick={() => { setCurrentIndex(index => index + 1); setSaveError(null); }}>السؤال التالي ←</button> : !reviewMode ? <button className="btn btn-gold" type="button" onClick={handleSubmit} disabled={isBusy}>{submitting ? "جارٍ الإرسال…" : "إنهاء وعرض النتيجة"}</button> : null}
        <button className="btn btn-secondary" type="button" onClick={restartQuiz} disabled={isBusy}>{restarting ? "جارٍ بدء المحاولة…" : "↻ إعادة الاختبار"}</button>
      </div>
      {reviewMode ? <div className="quiz-result" role="status">
        <div className="score-big">{automaticCorrect} / {automaticQuestions.length} ({automaticQuestions.length ? Math.round(automaticCorrect / automaticQuestions.length * 100) : 0}%)</div>
        <div className="score-sub">نتيجة الاختبار</div>
        <div className="bars">
          <span className="badge badge-easy">✓ إجابة صحيحة: {automaticCorrect}</span>
          <span className="badge badge-hard">✕ إجابة غير صحيحة: {automaticWrong}</span>
          <span className="badge badge-type">عدد الأسئلة: {filteredQuestions.length}</span>
        </div>
        {filteredQuestions.some(item => item.questionType === "open") ? <p className="score-sub">المقالات والسيناريوهات متاحة للمراجعة الذاتية من خلال الإجابة النموذجية.</p> : null}
      </div> : null}
      {submitError ? <p className="quiz-error" role="alert">{submitError}</p> : null}
    </section>
  );
}
