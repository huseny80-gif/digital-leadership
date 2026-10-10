"use client";

import Link from "next/link";
import { examSummaryPresentation } from "@digital-leadership/shared";
import { useEffect, useState } from "react";
import type { ExamMaterialSummary, ExamAudioChapter } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { FloatingPdfButton } from "@/components/printing/FloatingPdfButton";
import { examSummaryPrintDocument } from "@/components/printing/printDocuments";
import styles from "./examMaterial.module.css";
import { ExamAudioPlayer } from "./ExamAudioPlayer";

export function ExamAcademicSummary({ summary, subjectId, groupId, chapters }: { summary: ExamMaterialSummary; subjectId: string; groupId?: string; chapters?: ExamAudioChapter[] }) {
  const display = examSummaryPresentation(summary);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  async function downloadNarration() {
    if (downloadBusy || !groupId) return;
    setDownloadBusy(true); setDownloadError(null);
    try {
      const response = await fetch(`/api/exam-material/${subjectId}/${encodeURIComponent(groupId)}/review-narration.txt`, { cache: "no-store" });
      if (!response.ok) throw new Error("تعذر تنزيل نص السرد.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = "السرد-الأكاديمي-القيادة-الرقمية.txt"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setDownloadError(error instanceof Error ? error.message : "تعذر تنزيل نص السرد."); }
    finally { setDownloadBusy(false); }
  }
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (target.startsWith("summary-lecture-")) document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, []);
  return <article id="exam-summary-panel" role="tabpanel" aria-labelledby="exam-summary-tab" className={styles.summary}>
    <FloatingPdfButton label="طباعة الملخص الشامل PDF" document={examSummaryPrintDocument(summary)} />
    <div className={styles.summaryActions}><button type="button" className={styles.quiet} disabled={downloadBusy || !chapters?.length || !groupId} onClick={() => void downloadNarration()}><PlatformIcon name="download" />{downloadBusy ? "جارٍ تجهيز النص…" : "تنزيل نص السرد الأكاديمي"}</button>{downloadError ? <span className={styles.error} role="alert">{downloadError}</span> : null}</div>
    <div className={styles.summaryCover}><span className={styles.eyebrow}>المادة الامتحانية · الملخص الشامل</span><h3>مراجعة أكاديمية للمحاضرات المختارة</h3>{summary.introduction ? <p>{summary.introduction}</p> : null}</div>
    {chapters?.length && groupId ? <ExamAudioPlayer chapters={chapters} subjectId={subjectId} groupId={groupId} /> : null}
    <nav className={styles.summaryIndex} aria-label="فهرس الملخص"><h4>محتويات المراجعة</h4><ol>{summary.sections.map(section => <li key={section.id}><a href={`#summary-lecture-${section.id}`}><span className={styles.lectureNumber}>{section.number}</span><span>{section.title}</span><PlatformIcon name="arrow" /></a></li>)}</ol></nav>
    {display.sections.map(section => <section id={`summary-lecture-${section.id}`} key={section.id} className={styles.summarySection}>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>المحاضرة {section.number}</span><h3>{section.title}</h3></div><Link href={`/subjects/${subjectId}/lectures/${section.id}`} className={styles.sourceLink}>المحاضرة الأصلية <PlatformIcon name="arrow" /></Link></div>
      {section.objectives?.length ? <details className={styles.objectives}><summary>أهداف المحاضرة</summary><ul>{section.objectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul></details> : null}
      {section.topics?.length ? <div className={styles.topicList}>{section.topics.map((topic, index) => <section className={styles.summaryTopic} key={index}><h4><span>{index + 1}</span>{topic.title}</h4>{topic.text.split(/\n{2,}/).map((paragraph, number) => <p key={number}>{paragraph}</p>)}{topic.details ? <details className={styles.topicDetails}><summary>تفاصيل المحور وتطبيقاته</summary>{topic.details.split(/\n{2,}/).map((paragraph, number) => <p key={number}>{paragraph}</p>)}</details> : null}</section>)}</div> : <div className={styles.legacyNarrative}>{section.text.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
      {section.concepts?.length ? <section className={styles.concepts} aria-label={`مفاهيم ${section.title}`}><h4>المفاهيم والمصطلحات الأساسية</h4><dl>{section.concepts.map((concept, index) => <div key={index}><dt>{concept.term}</dt><dd>{concept.definition}</dd></div>)}</dl></section> : null}
      {section.keyPoints.length ? <details className={styles.keyPoints}><summary>نقاط أساسية للمراجعة</summary><ul>{section.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></details> : null}
      <a href="#exam-summary-panel" className={styles.summaryTop}>العودة إلى بداية الملخص ↑</a>
    </section>)}
  </article>;
}
