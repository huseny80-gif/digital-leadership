import Link from "next/link";
import type { ExamKnowledgeGapReport } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ExamSourceCitation } from "./ExamSourceCitation";
import styles from "./examMaterial.module.css";

export function ExamKnowledgeGaps({ report, subjectId }: { report: ExamKnowledgeGapReport; subjectId: string }) {
  return <section className={styles.analysisPanel} aria-labelledby="exam-knowledge-gaps-heading">
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>خطة مراجعتك الشخصية</span><h3 id="exam-knowledge-gaps-heading"><PlatformIcon name="network" />كاشف الثغرات المعرفية</h3></div><span className={styles.badge}>{report.gaps.length} محور للمراجعة</span></div>
    <div className={styles.analysisStats}><span>إجابات غير صحيحة <strong>{report.incorrectAnswers}</strong></span><span>أسئلة لم تُجب عنها <strong>{report.unansweredQuestions}</strong></span></div>
    {!report.incorrectAnswers && !report.unansweredQuestions ? <p className={styles.success}>أجبت عن جميع أسئلة هذه المحاولة إجابة صحيحة. لا توجد فقرات تحتاج إلى مراجعة وفق هذه النتيجة.</p> : <p className={styles.muted}>راجع الفقرات المرتبطة بإجاباتك غير الصحيحة. الأسئلة التي لم تُجب عنها تظهر بصورة مستقلة ولا تُعدّ دليلًا على ضعف معرفي.</p>}
    <div className={styles.analysisCards}>{report.gaps.map(gap => <article key={`${gap.lectureId}:${gap.id}`} className={styles.analysisCard}>
      <span className={styles.eyebrow}>{gap.lectureTitle}</span><h4>{gap.topic}</h4>
      <div className={styles.gapCounts}>{gap.wrongQuestionIds.length ? <span data-tone="review">{gap.wrongQuestionIds.length} إجابة غير صحيحة</span> : null}{gap.unansweredQuestionIds.length ? <span>{gap.unansweredQuestionIds.length} سؤال لم تُجب عنه</span> : null}</div>
      {gap.references.map((reference, index) => <ExamSourceCitation key={`${reference.paragraphId}:${index}`} reference={reference} />)}
      <Link className={styles.sourceLink} href={`/subjects/${subjectId}/lectures/${gap.lectureId}`}>فتح المحاضرة الأصلية <PlatformIcon name="arrow" /></Link>
    </article>)}</div>
    {report.unmappedQuestions ? <p className={styles.muted}>{report.unmappedQuestions} سؤال من هذه المراجعة القديمة لا يتضمن إحالة نصية موثقة. تتوفر الإحالات الدقيقة في المراجعات المولّدة حديثًا.</p> : null}
  </section>;
}
