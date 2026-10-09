"use client";

import { useEffect, useRef, useState } from "react";
import type { ExamMaterialDetail } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./examMaterial.module.css";

export function ExamRevisionPackage({ group }: { group: ExamMaterialDetail }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function download() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`/api/exam-material/${group.subjectId}/${group.id}/review-package.pdf`, { cache: "no-store", signal: request.signal });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message ?? "تعذر تنزيل الحزمة."); }
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("تعذر إعداد ملف PDF. حاول مرة أخرى.");
      const blob = await response.blob();
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `حزمة المراجعة - ${group.title.replace(/[/\\:*?"<>|]/g, "-")}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000); setSaved(true);
    } catch (reason) { if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تنزيل الحزمة. حاول مرة أخرى."); }
    finally { controller.current = null; if (!request.signal.aborted) setBusy(false); }
  }
  return <section id="exam-package-panel" role="tabpanel" aria-labelledby="exam-package-tab" className={styles.packagePanel}>
    <div className={styles.packageCover}><span className={styles.largeIcon}><PlatformIcon name="download" /></span><span className={styles.eyebrow}>مراجعتك أينما كنت</span><h3>حزمة المراجعة الذكية</h3><p>ملف PDF عربي منسق بشعار المنصة، يجمع محتوى هذه المجموعة للمراجعة والطباعة.</p></div>
    <div className={styles.packageItems}><div><PlatformIcon name="document" /><h4>الملخص الشامل</h4><p>جميع المحاور والمفاهيم والتفاصيل العلمية للمحاضرات المختارة.</p></div><div><PlatformIcon name="network" /><h4>خريطة المفاهيم</h4><p>خرائط بصرية قابلة للطباعة، مع روابط المصطلحات المشتركة.</p></div><div><PlatformIcon name="quiz" /><h4>الأسئلة التدريبية</h4><p>{group.questionCount} سؤالًا متنوعًا، مع خيارات الإجابة ومساحة للتدريب.</p></div></div>
    <details className={styles.packageSources}><summary>المحاضرات المضمنة في الحزمة ({group.lectures.length})</summary><ol>{group.lectures.map(lecture => <li key={lecture.id}>{lecture.title}</li>)}</ol></details>
    <p className={styles.muted}>تُصدّر المراجعة {group.sequence} كما هي محفوظة في الأرشيف. يتوفر التصحيح والتعليل داخل الاختبار التفاعلي.</p>
    <button type="button" className={styles.action} disabled={busy} onClick={() => void download()}><PlatformIcon name="download" />{busy ? "جارٍ تجهيز الحزمة…" : "تصدير حزمة المراجعة PDF"}</button>
    {error ? <p className={styles.error} role="alert">{error}</p> : saved ? <p className={styles.success} role="status">تم تجهيز حزمة المراجعة وتنزيلها بنجاح.</p> : null}
  </section>;
}
