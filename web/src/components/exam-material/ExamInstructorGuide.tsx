"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ExamInstructorGuide as InstructorGuide } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ExamSourceCitation } from "./ExamSourceCitation";
import { examRequest } from "./request";
import styles from "./examMaterial.module.css";

/** Backend authorization is required independently of the parent's UI gate. */
export function ExamInstructorGuide({ subjectId, groupId }: { subjectId: string; groupId: string }) {
  // A selected archive owns its private request and cache. Switching archives
  // remounts the panel and aborts the former request, including late responses.
  return <InstructorGuidePanel key={`${subjectId}:${groupId}`} subjectId={subjectId} groupId={groupId} />;
}

function InstructorGuidePanel({ subjectId, groupId }: { subjectId: string; groupId: string }) {
  const [guide, setGuide] = useState<InstructorGuide | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(force = false) {
    if (pending.current || guide && !force) return;
    if (force) setGuide(null);
    pending.current = true; setBusy(true); setError(null);
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    try {
      const result = await examRequest<InstructorGuide>(`/api/admin/subjects/${subjectId}/exam-material/${groupId}/instructor-guide`, { signal: request.signal });
      if (result.groupId !== groupId || result.generator !== "source-verified-instructor-v2" || result.sourceScope !== "current-lecture-files") throw new Error("تعذر التحقق من تدقيق هذا الدليل. أعد تحميله للحصول على النسخة الموثّقة.");
      if (!request.signal.aborted) setGuide(result);
    } catch (error) { if (!request.signal.aborted) setError(error instanceof Error ? error.message : "تعذر تحميل دليل المناقشة."); }
    finally { if (!request.signal.aborted) { pending.current = false; setBusy(false); } }
  }
  return <details className={styles.instructorPanel} onToggle={event => { if (event.currentTarget.open) void load(); }}>
    <summary><PlatformIcon name="clipboard" /><span>دليل المناقشة الذكي للمدير</span><small>خاص بالمدير</small></summary>
    <div className={styles.instructorBody}>
      <p className={styles.muted}>محاور موثّقة من الملفات الحالية للمحاضرات المختارة، مخصصة للمناقشة القادمة. هذه محاور للتوضيح وليست نتائج فعلية عن مستوى المتدربين.</p>
      {guide ? <button type="button" className={styles.quiet} disabled={busy} onClick={() => void load(true)}>إعادة تدقيق الدليل</button> : null}
      {busy ? <p role="status" className={styles.notice}>جارٍ تحميل الدليل الموثق…</p> : error ? <div className={styles.historyError} role="alert"><p>{error}</p><button type="button" className={styles.quiet} onClick={() => void load()}>إعادة المحاولة</button></div> : guide ? <div className={styles.analysisCards}>{guide.items.map(item => <article key={`${item.lectureId}:${item.id}`} className={styles.analysisCard}>
        <span className={styles.eyebrow}>{item.lectureTitle}</span><h4>{item.topic}</h4>
        {item.scenario ? <><h5>الموقف الدراسي</h5><p>{item.scenario}</p></> : null}
        <h5>محور التوضيح</h5><p className={styles.muted}>{item.expectedGap}</p>
        <h5>سؤال مناقشة مفتوح</h5><p className={styles.discussionQuestion}>{item.discussionQuestion}</p>
        {item.references.map((reference, index) => <ExamSourceCitation key={`${reference.paragraphId}:${index}`} reference={reference} />)}
        <Link className={styles.sourceLink} href={`/subjects/${subjectId}/lectures/${item.lectureId}`}>مراجعة المحاضرة <PlatformIcon name="arrow" /></Link>
      </article>)}</div> : null}
      {guide?.unavailableLectures?.length ? <p className={styles.notice} role="status">لم يُعتمد محور مناقشة للمحاضرات التالية لعدم توفر نص مرجعي واضح وكافٍ: {guide.unavailableLectures.map(lecture => lecture.lectureTitle).join("، ")}. يلزم مراجعة ملفاتها الأصلية قبل إعداد دليل لها.</p> : null}
    </div>
  </details>;
}
