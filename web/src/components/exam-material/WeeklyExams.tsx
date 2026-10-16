"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WeeklyExamCollection, WeeklyExamPaper, WeeklyExamQuestion, WeeklyExamSolution } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { examRequest } from "./request";
import styles from "./weeklyExams.module.css";

const labels = ["أ", "ب", "ج", "د"];
const level = { easy: "سهل", medium: "متوسط", hard: "صعب" };
const number = (value: number) => value.toLocaleString("ar");

function Question({ question }: { question: WeeklyExamQuestion }) {
  return <><div className={styles.meta}><span>السؤال {number(question.number)}</span><span>{question.type === "case_study" ? "سيناريو مفتوح" : "اختيار من متعدد"}</span>
    <span>{level[question.difficulty]}</span><span>{number(question.points)} {question.proposedPoints ? "درجة مقترحة" : "درجة"}</span></div>
    <h3 className={styles.prompt}>{question.prompt}</h3></>;
}
function Solution({ answer }: { answer: WeeklyExamSolution }) {
  return <section className={styles.solution} aria-label="الحل النموذجي والتغذية الراجعة">
    <h4>{answer.isCorrect === undefined ? "الإجابة النموذجية" : answer.isCorrect ? "إجابة صحيحة" : "إجابة غير صحيحة — راجع التوضيح"}</h4>
    {typeof answer.modelAnswer === "string" ? <p><strong>الإجابة الصحيحة: {answer.correctIndex === null ? "" : `${labels[answer.correctIndex]} — `}</strong>{answer.modelAnswer}</p>
      : answer.modelAnswer.map(section => <div key={section.heading}><h4>{section.heading}</h4><p>{section.text}</p></div>)}
    <p className={styles.rationale}>{answer.rationale}</p>
    {answer.rubric ? <><h4>سلم مراجعة مقترح</h4><ul>{answer.rubric.map(item => <li key={item.criterion}>{item.criterion} — {number(item.points)} درجات</li>)}</ul></> : null}
    {answer.answerReferences?.map(reference => <p className={styles.citation} key={reference.sha256}>مرجع الحل: {reference.filename} — {reference.topic}</p>)}
  </section>;
}

export function WeeklyExams({ subjectId, collection, initialPaper: paper }: {
  subjectId: string; collection: WeeklyExamCollection; initialPaper: WeeklyExamPaper;
}) {
  const [view, setView] = useState<"practice" | "paper" | "solutions">("practice");
  const [index, setIndex] = useState(0), [choices, setChoices] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, WeeklyExamSolution>>({});
  const [solutions, setSolutions] = useState<WeeklyExamSolution[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [essay, setEssay] = useState("");
  const controller = useRef<AbortController | null>(null), pending = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const question = paper.questions[index]!, answer = feedback[question.id];
  const root = `/api/weekly-exams/${subjectId}/${paper.id}`;
  const completed = Object.keys(feedback).length, correct = Object.values(feedback).filter(answer => answer.isCorrect).length;

  async function check() {
    if (pending.current || question.type === "multiple_choice" && choices[question.id] === undefined) return;
    pending.current = true; setBusy(true); setError(null);
    const active = new AbortController(); controller.current = active;
    try {
      const response = await examRequest<WeeklyExamSolution>(`${root}/check`, { method: "POST", signal: active.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: question.id,
          ...(question.type === "multiple_choice" ? { selectedIndex: choices[question.id] } : {}) }) });
      if (!active.signal.aborted) setFeedback(previous => ({ ...previous, [question.id]: response }));
    } catch (error) { if (!active.signal.aborted) setError(error instanceof Error ? error.message : "تعذر عرض الإجابة."); }
    finally { if (!active.signal.aborted) { pending.current = false; setBusy(false); } }
  }
  async function showSolutions() {
    if (pending.current) return;
    setView("solutions"); if (solutions) return;
    pending.current = true; setBusy(true); setError(null);
    const active = new AbortController(); controller.current = active;
    try { const result = await examRequest<WeeklyExamSolution[]>(`${root}/solutions`, { signal: active.signal }); if (!active.signal.aborted) setSolutions(result); }
    catch (error) { if (!active.signal.aborted) setError(error instanceof Error ? error.message : "تعذر تحميل نموذج الإجابة."); }
    finally { if (!active.signal.aborted) { pending.current = false; setBusy(false); } }
  }
  function move(next: number) { if (busy) return; setIndex(next); setError(null); }

  return <div className={styles.workspace}>
    <nav className={styles.paperList} aria-label="الاختبارات حسب الأسابيع">{collection.papers.map(item => <Link key={item.id}
      href={`/subjects/${subjectId}/exam-material/weekly-tests?paper=${item.id}`} aria-current={item.id === paper.id ? "page" : undefined}>
      <PlatformIcon name={item.kind === "open_book" ? "document" : "quiz"} /><strong>{item.week ? `الأسبوع ${number(item.week)}` : "السؤال المفتوح"}</strong><span>{number(item.questionCount)} {item.questionCount === 1 ? "سيناريو مستقل" : "سؤالًا"}</span>
    </Link>)}</nav>
    <section className={styles.panel}>
      <header className={styles.header}><div><p className={styles.eyebrow}>حوكمة الأمن السيبراني</p><h2>{paper.title}</h2>
        <p>{number(paper.questionCount)} سؤالًا · {number(paper.totalPoints)} {paper.kind === "open_book" ? "درجة مقترحة" : "درجة"} · المدة المقترحة: {number(paper.suggestedMinutes)} دقيقة</p></div>
        <div className={styles.downloads}><a href={`${root}/paper.pdf`}><PlatformIcon name="download" />ورقة الأسئلة PDF</a><a href={`${root}/paper.pdf?answers=1`}><PlatformIcon name="document" />الحل النموذجي PDF</a></div>
      </header>
      <p className={styles.note}>{collection.solutionNote}</p>
      <nav className={styles.views} aria-label="طريقة عرض الاختبار">
        <button type="button" aria-pressed={view === "practice"} disabled={busy} onClick={() => setView("practice")}>تدريب تفاعلي</button>
        <button type="button" aria-pressed={view === "paper"} disabled={busy} onClick={() => setView("paper")}>الورقة الامتحانية</button>
        <button type="button" aria-pressed={view === "solutions"} disabled={busy} onClick={() => void showSolutions()}>نموذج الإجابة والتغذية الراجعة</button>
      </nav>
      {error ? <p className={styles.error} role="alert">{error}<button disabled={busy} onClick={() => void (view === "solutions" ? showSolutions() : check())}>إعادة المحاولة</button></p> : null}
      {view === "practice" ? <>
        <div className={styles.progress} aria-live="polite"><span>السؤال {number(index + 1)} من {number(paper.questionCount)}</span>
          <span>{paper.kind === "weekly" ? `تمت مراجعة ${number(completed)} · الصحيحة ${number(correct)}` : "مراجعة ذاتية أو من المدرب"}</span></div>
        <article className={styles.question}><Question question={question} />
          {question.type === "case_study" ? <><label className={styles.essayLabel} htmlFor="weekly-essay">اكتب تحليلك قبل مراجعة النموذج (اختياري)</label><textarea id="weekly-essay" rows={8} value={essay} maxLength={20000} onChange={event => setEssay(event.target.value)} placeholder="حدد فرضيتك، ثم نظم مراحل التطبيق ومسؤولياتها وأدلتها…" /><p className={styles.citation}>مسودة محلية في هذه الصفحة؛ لا تُرسل للتصحيح الآلي.</p></>
            : <fieldset className={styles.options} disabled={busy || Boolean(answer)}><legend className={styles.srOnly}>اختر إجابة للسؤال {number(question.number)}</legend>{question.options.map((option, i) => <label key={i} data-selected={choices[question.id] === i} data-correct={answer ? answer.correctIndex === i : undefined}>
              <input type="radio" name={question.id} checked={choices[question.id] === i} onChange={() => setChoices(previous => ({ ...previous, [question.id]: i }))} value={i} /><span className={styles.letter}>{labels[i]}</span><span>{option}</span>
            </label>)}</fieldset>}
          <p className={styles.citation}>مصدر السؤال: {question.questionReference.filename}، الصفحة {number(question.questionReference.page!)}.</p>
          <button className={styles.primary} disabled={busy || Boolean(answer) || question.type === "multiple_choice" && choices[question.id] === undefined} onClick={() => void check()}>
            {busy ? "جارٍ التحقق…" : question.type === "case_study" ? "عرض الإجابة النموذجية ومعايير التصحيح" : "تحقق من الإجابة"}</button>
          {answer ? <div aria-live="polite"><Solution answer={answer} /></div> : null}
        </article>
        <div className={styles.pager}><button disabled={index === 0 || busy} onClick={() => move(index - 1)}>السؤال السابق</button><span>{number(index + 1)} / {number(paper.questionCount)}</span><button disabled={index === paper.questions.length - 1 || busy} onClick={() => move(index + 1)}>السؤال التالي</button></div>
        {paper.kind === "weekly" && completed === paper.questionCount ? <p className={styles.result} role="status">اكتملت المراجعة: {number(correct)} من {number(paper.questionCount)} إجابة صحيحة ({number(Math.round(correct / paper.questionCount * 100))}٪).</p> : null}
      </> : view === "solutions" && !solutions ? <p role="status" className={styles.note}>{busy ? "جارٍ تحميل نموذج الإجابة…" : "اختر إعادة المحاولة لتحميل نموذج الإجابة."}</p>
        : <div className={styles.fullPaper}>{paper.questions.map(item => <article key={item.id} className={styles.question}><Question question={item} />
          {view === "paper" && item.options.length ? <ol className={styles.paperOptions}>{item.options.map((option, i) => <li key={i}><span>{labels[i]} — </span>{option}</li>)}</ol> : null}
          {view === "paper" && item.type === "case_study" ? <p className={styles.note}>اكتب إجابة منظمة تربط الفرضيات بمراحل خارطة الطريق. استخدم نموذج الإجابة للمراجعة بعد إكمال التحليل.</p> : null}
          <p className={styles.citation}>مصدر السؤال: {item.questionReference.filename}، الصفحة {number(item.questionReference.page!)}.</p>
          {view === "solutions" && solutions?.find(answer => answer.questionId === item.id) ? <Solution answer={solutions.find(answer => answer.questionId === item.id)!} /> : null}
        </article>)}</div>}
    </section>
    <Link className={styles.back} href={`/subjects/${subjectId}/exam-material`}>الرجوع إلى مجموعات المادة الامتحانية <PlatformIcon name="arrow" /></Link>
  </div>;
}
