"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { AcademicExamPaper, AcademicExamQuestionType } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { examRequest } from "./request";
import { ExamSourceCitation } from "./ExamSourceCitation";
import styles from "./examMaterial.module.css";

const labels: Record<AcademicExamQuestionType, string> = { multiple_choice: "اختيار من متعدد", true_false: "صح / خطأ", match: "مطابقة", order: "ترتيب", short_answer: "مقالي", case_study: "سيناريو قصير" };
const number = (value: number) => value.toLocaleString("ar-IQ");
const optionLetter = (value: number) => "أبجد"[value] ?? number(value + 1);

export function ExamAcademicPaper({ subjectId, groupId, attemptId }: { subjectId: string; groupId: string; attemptId?: string }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<{ key: string; paper: AcademicExamPaper | null; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const endpoint = `/api/exam-material/${subjectId}/${groupId}/academic-paper${attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : ""}`;
  const requestKey = `${endpoint}:${retry}`;
  const current = result?.key === requestKey ? result : null;
  const paper = current?.paper;
  const error = current?.error;
  const busy = expanded && !current;
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    void examRequest<AcademicExamPaper>(endpoint, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult({ key: requestKey, paper: value, error: null });
    }).catch(reason => { if (!controller.signal.aborted) setResult({ key: requestKey, paper: null, error: reason instanceof Error ? reason.message : "تعذّر إعداد الورقة الامتحانية." }); });
    return () => controller.abort();
  }, [expanded, endpoint, requestKey]);

  return <section className={styles.academicPaper}>
    <button type="button" className={styles.paperToggle} aria-expanded={expanded} aria-controls={panelId} onClick={() => { if (!expanded) setRetry(value => value + 1); setExpanded(value => !value); }}>
      <span><PlatformIcon name="document" /> الورقة الامتحانية الأكاديمية</span><span aria-hidden="true">{expanded ? "−" : "+"}</span>
    </button>
    {expanded ? <div id={panelId} className={styles.paperBody}>
      {busy ? <p className={styles.notice} role="status">جارٍ إعداد الأسئلة وتوزيع الدرجات…</p> : error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" className={styles.quiet} onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</button></div> : paper ? <>
        <section aria-label={paper.questionSectionTitle}>
          <div className={styles.sectionHead}><h3>{paper.questionSectionTitle}</h3><span className={styles.badge}>الدرجة الكلية: {number(paper.totalPoints)}</span></div>
          <p className={styles.muted}>ورقة متنوعة الصيغ من المحاضرات المختارة. تُراجع الإجابات المقالية والسيناريوهات وفق نموذج الإجابة ومعايير التصحيح.</p>
          <div className={styles.paperTable}><table><caption>توزيع درجات الورقة التحريرية</caption><thead><tr><th scope="col">نوع السؤال</th><th scope="col">العدد</th><th scope="col">الدرجات</th></tr></thead><tbody>{paper.distribution.filter(item => item.count > 0).map(item => <tr key={item.type}><th scope="row">{labels[item.type]}</th><td>{number(item.count)}</td><td>{number(item.points)}</td></tr>)}</tbody></table></div>
          {paper.questions.map((question, index) => <article className={styles.paperQuestion} key={question.id}>
            <div className={styles.sectionHead}><h4>السؤال {number(index + 1)} — {labels[question.type]}</h4><span className={styles.badge}>الدرجة: {number(question.points)}</span></div>
            {question.difficulty ? <span className={styles.badge}>المستوى: {{ easy: "سهل", medium: "متوسط", hard: "صعب", very_hard: "صعب جدًا" }[question.difficulty]}</span> : null}
            <Link className={styles.sourceLink} href={`/subjects/${subjectId}/lectures/${question.lectureId}`}>{question.lectureTitle}</Link>
            <p>{question.prompt}</p><p className={styles.muted}>{question.instructions}</p>
            <ol className={styles.paperOptions}>{question.options.map((option, optionIndex) => <li key={optionIndex}><span>{optionLetter(optionIndex)})</span> {option}</li>)}</ol>
            {question.matchItems ? <div className={styles.paperTable}><table><caption>عناصر المطابقة — القائمتان مستقلتان</caption><thead><tr><th scope="col">القائمة الأولى</th><th scope="col">القائمة الثانية</th></tr></thead><tbody>{question.matchItems.left.map((text, index) => <tr key={index}><td>{index + 1}. {text}</td><td>{optionLetter(index)}) {question.matchItems!.right[index]}</td></tr>)}</tbody></table></div> : null}
            {question.orderItems ? <ul className={styles.paperOptions}>{question.orderItems.map((text, index) => <li key={index}>{text}</li>)}</ul> : null}
            <details className={styles.paperLocations}><summary>مرجع السؤال في المحاضرة</summary><ul>{question.sources.map((source, sourceIndex) => <li key={sourceIndex}><bdi>{source.filename}</bdi> — الفقرة {number(source.number)}، الأسطر {number(source.startLine)}–{number(source.endLine)} من النص المستخرج</li>)}</ul></details>
          </article>)}
        </section>
        <section aria-label={paper.answerSectionTitle} className={styles.paperAnswers}>
          <h3>{paper.answerSectionTitle}</h3>
          {paper.answerKey ? <><p className={styles.muted}>توزيع الدرجات دليل للتصحيح التحريري. يُقبل التعبير السليم الذي يؤدي المعنى المثبت في المصدر؛ لا تُشترط مطابقة الألفاظ حرفيًا في الإجابات المكتوبة.</p>{paper.answerKey.map(answer => {
            const index = paper.questions.findIndex(question => question.id === answer.questionId);
            return <article className={styles.paperQuestion} key={answer.questionId}>
              <h4>إجابة السؤال {number(index + 1)}</h4>
              {answer.correctOptionIndex !== undefined ? <p className={styles.eyebrow}>البديل الصحيح: {optionLetter(answer.correctOptionIndex)}</p> : null}
              <p>{answer.modelAnswer}</p><p>{answer.explanation}</p>
              <div className={styles.paperTable}><table><caption>معايير تصحيح السؤال {number(index + 1)}</caption><thead><tr><th scope="col">المعيار</th><th scope="col">الإجابة المتوقعة ودليلها</th><th scope="col">الدرجات</th></tr></thead><tbody>{answer.rubric.map((criterion, criterionIndex) => <tr key={criterionIndex}><th scope="row">{criterion.criterion}</th><td><p>{criterion.expected}</p>{criterion.references.map((reference, referenceIndex) => <ExamSourceCitation key={referenceIndex} reference={reference} />)}</td><td>{number(criterion.points)}</td></tr>)}</tbody></table></div>
              <details className={styles.paperLocations}><summary>تفسير البدائل في ضوء المصدر</summary>{answer.optionReviews.map((option, optionIndex) => <div key={optionIndex}><p><strong>{option.text}</strong></p><p>{option.rationale}</p>{option.references.map((reference, referenceIndex) => <ExamSourceCitation key={referenceIndex} reference={reference} />)}</div>)}</details>
            </article>;
          })}</> : <p className={styles.notice}>يتاح نموذج الإجابة للمدير، وللمتدرب بعد إنهاء الاختبار التفاعلي لهذه المراجعة.</p>}
        </section>
      </> : null}
    </div> : null}
  </section>;
}
