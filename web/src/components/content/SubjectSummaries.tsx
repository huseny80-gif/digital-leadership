"use client";

import { useEffect, useRef, useState } from "react";
import type { StudySummaryDocument } from "@digital-leadership/shared";
import { loadSubjectSummaries, StudyContentError } from "./subjectSummaryData";
import { LecturePodcast } from "./LecturePodcast";
import styles from "./SubjectSummaries.module.css";

type View = { kind: "loading"; message: string } | { kind: "error"; message: string } | { kind: "ready"; document: StudySummaryDocument };
const number = (value: number) => new Intl.NumberFormat("ar-IQ").format(value);

export function SubjectSummaries({ subjectId, subjectTitle }: { subjectId: string; subjectTitle: string }) {
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>({ kind: "loading", message: "جارٍ تحميل ملخصات هذه المادة…" });
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    // The component is keyed by subject at the page boundary. Never preserve
    // one subject's document while a different subject is being loaded.
    let current = true;
    loadSubjectSummaries(subjectId, controller.signal, () => {
      if (current) setView({ kind: "loading", message: "جارٍ تجهيز ملخصات هذه المادة من ملفات محاضراتها…" });
    }).then(document => { if (current) setView({ kind: "ready", document }); })
      .catch(error => { if (current && !controller.signal.aborted) setView({ kind: "error", message: error instanceof StudyContentError ? error.message : "تعذر تحميل ملخصات هذه المادة. أعد المحاولة." }); });
    return () => { current = false; controller.abort(); };
  }, [subjectId, attempt]);

  useEffect(() => {
    if (view.kind !== "ready" || view.document.subjectId !== subjectId) return;
    const lectures = view.document.lectures;
    const revealHash = () => {
      const anchor = window.location.hash.slice(1);
      const lecture = lectures.find(item => anchor === `lecture-${item.number}` || anchor === item.id || anchor === item.catalogId);
      const card = lecture ? container.current?.querySelector<HTMLDetailsElement>(`#lecture-${lecture.number}`) : null;
      if (card) { card.open = true; card.scrollIntoView?.({ block: "start" }); }
    };
    revealHash();
    window.addEventListener("hashchange", revealHash);
    return () => window.removeEventListener("hashchange", revealHash);
  }, [view, subjectId]);

  function refresh() { setView({ kind: "loading", message: "جارٍ تحديث ملخصات هذه المادة…" }); setAttempt(value => value + 1); }

  function openLecture(number: number) {
    const card = container.current?.querySelector<HTMLDetailsElement>(`#lecture-${number}`);
    if (card) card.open = true;
  }

  return <div className={styles.workspace} ref={container} dir="rtl" aria-label={`ملخصات وبودكاست ${subjectTitle}`}
    onPlayCapture={event => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      container.current?.querySelectorAll("audio").forEach(element => { if (element !== event.target) element.pause(); });
    }}>
    <header className={styles.introduction}>
      <h2>مراجعتك الأكاديمية في {subjectTitle}</h2>
      <p>ملخص مستقل لكل محاضرة من هذه المادة، مع شرح النقاط الرئيسة وبودكاست مطابق لنص الملخص.</p>
      <p className={styles.helper}>تُنتج التسجيلات بأصوات آلية من نص المحاضرة الملخّص، وتُجهز عند طلب تشغيلها.</p>
    </header>
    {view.kind === "loading" || view.kind === "ready" && view.document.subjectId !== subjectId ? <p className={styles.notice} role="status" aria-live="polite">{view.kind === "loading" ? view.message : "جارٍ تحميل ملخصات هذه المادة…"}</p> : null}
    {view.kind === "error" ? <section className={styles.notice} role="alert"><p>{view.message}</p><button type="button" className={styles.primaryButton} onClick={refresh}>إعادة تحميل الملخصات</button></section> : null}
    {view.kind === "ready" && view.document.subjectId === subjectId ? <>
      <div className={styles.courseStatus}><p><strong>{number(view.document.lectures.length)}</strong> محاضرات بملخصات معتمدة</p><button type="button" className={styles.secondaryButton} onClick={refresh}>تحديث الملخصات</button></div>
      {view.document.unavailableLectures.length ? <section className={styles.notice} aria-label="ملاحظات على مصادر المحاضرات"><h3>ملاحظات على ملفات المحاضرات</h3><ul>{view.document.unavailableLectures.map((item, index) => <li key={`${item.lectureId}-${index}`}><a className={styles.textLink} href={`/subjects/${subjectId}/lectures/${item.lectureId}`}>{item.title}</a>: {item.reason}</li>)}</ul></section> : null}
      {!view.document.lectures.length ? <p className={styles.notice}>لا تتوفر ملخصات معتمدة لمحاضرات هذه المادة بعد. ستظهر هنا عند اعتماد ملفاتها.</p> : <>
        <nav className={styles.lectureIndex} aria-label={`فهرس ملخصات ${subjectTitle}`}>
          {view.document.lectures.map(lecture => <a key={lecture.lectureId} href={`#lecture-${lecture.number}`} onClick={() => openLecture(lecture.number)}>المحاضرة {number(lecture.number)}</a>)}
        </nav>
        <div className={styles.lectures}>{view.document.lectures.map((lecture, index) => <details key={`${lecture.lectureId}:${lecture.summarySha256}`} id={`lecture-${lecture.number}`} className={styles.lecture} open={index === 0}>
          <summary className={styles.lectureHeading}><span className={styles.lectureNumber} aria-hidden="true">{number(lecture.number)}</span><h2>{lecture.title}</h2><span className={styles.lectureHint}>الملخص والبودكاست</span></summary>
          <div className={styles.lectureBody}>
            <LecturePodcast subjectId={subjectId} lecture={lecture} voices={view.document.voices} onRefreshSummary={refresh} />
            <article className={styles.summaryText} id={`summary-text-${lecture.number}`} aria-label={`الملخص الأكاديمي: ${lecture.title}`}>
              <p className={styles.overview}>{lecture.overview}</p>
              {lecture.sections.map((section, sectionIndex) => <section key={`${sectionIndex}:${section.heading}`}><h3>{section.heading}</h3><ul>{section.points.map((point, pointIndex) => <li key={`${pointIndex}:${point.term}`}><strong>{point.term}: </strong>{point.text}</li>)}</ul></section>)}
              <p className={styles.source}><span>المصدر: </span><bdi>{lecture.filename}</bdi></p>
              <a className={styles.textLink} href={lecture.sourceHref}>فتح المحاضرة الأصلية ←</a>
            </article>
          </div>
        </details>)}</div>
      </>}
    </> : null}
  </div>;
}
