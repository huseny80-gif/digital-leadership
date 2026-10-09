"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StudyCatalog, StudyReport, StudyReportRequest, StudySourceChoice, StudySourceKind } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { studyRequest } from "./request";
import styles from "./studyTools.module.css";

const kinds: Record<StudySourceKind, string> = { lecture: "المحاضرات", summary: "الملخصات", assignment: "الواجبات" };
const sourceKey = (source: StudySourceChoice) => `${source.subjectId}:${source.kind}:${source.id}`;
export function ReportBuilder({ initialCatalog, initialSubjectId }: { initialCatalog: StudyCatalog; initialSubjectId?: string }) {
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? initialCatalog.subjects[0]?.id ?? "");
  const [catalog, setCatalog] = useState(initialCatalog);
  const [filter, setFilter] = useState<StudySourceKind | "all">("all");
  const [selected, setSelected] = useState<StudySourceChoice[]>([]);
  const [title, setTitle] = useState("تقرير أكاديمي في القيادة الرقمية");
  const [author, setAuthor] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ report: StudyReport; request: StudyReportRequest; signature: string } | null>(null);
  const [outdated, setOutdated] = useState(false);
  const [tab, setTab] = useState<"body" | "references">("body");
  const sourceRequest = useRef<AbortController | null>(null);
  const reportRequest = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const request: StudyReportRequest = { title: title.trim(), author: author.trim(), notes, sources: selected.map(({ id, subjectId, kind }) => ({ id, subjectId, kind })) };
  const stale = outdated || preview?.signature !== JSON.stringify(request);

  useEffect(() => {
    if (!subjectId) return;
    const controller = new AbortController(); sourceRequest.current?.abort(); sourceRequest.current = controller;
    async function load() {
      setLoading(true); setSourceError(null);
      try {
        const result = await studyRequest<StudyCatalog>(`catalog?subjectId=${encodeURIComponent(subjectId)}&limit=100`, { signal: controller.signal });
        if (!controller.signal.aborted) setCatalog(result);
      } catch (reason) { if (!controller.signal.aborted) { setCatalog(previous => ({ ...previous, sources: [], total: 0, page: 1 })); setSourceError(reason instanceof Error ? reason.message : "تعذر تحميل المصادر."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [subjectId, retry]);
  useEffect(() => () => { sourceRequest.current?.abort(); reportRequest.current?.abort(); }, []);

  function toggle(source: StudySourceChoice) {
    if (busyRef.current) return;
    setSelected(previous => previous.some(item => sourceKey(item) === sourceKey(source)) ? previous.filter(item => sourceKey(item) !== sourceKey(source)) : previous.length < 20 ? [...previous, source] : previous);
    setError(null);
  }
  async function loadMore() {
    if (loading) return;
    const controller = new AbortController(); sourceRequest.current?.abort(); sourceRequest.current = controller;
    setLoading(true); setSourceError(null);
    try {
      const result = await studyRequest<StudyCatalog>(`catalog?subjectId=${encodeURIComponent(subjectId)}&page=${catalog.page + 1}&limit=100`, { signal: controller.signal });
      if (!controller.signal.aborted) setCatalog(previous => ({ ...result, sources: [...new Map([...previous.sources, ...result.sources].map(source => [sourceKey(source), source])).values()] }));
    } catch (reason) { if (!controller.signal.aborted) setSourceError(reason instanceof Error ? reason.message : "تعذر تحميل المصادر."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function generate(event: FormEvent) {
    event.preventDefault(); if (!selected.length || request.title.length < 3 || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    const controller = new AbortController(); reportRequest.current = controller;
    try {
      const report = await studyRequest<StudyReport>("report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: controller.signal });
      if (!controller.signal.aborted) { setPreview({ report, request, signature: JSON.stringify(request) }); setOutdated(false); setTab("body"); }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر إعداد التقرير."); }
    finally { if (!controller.signal.aborted) { busyRef.current = false; setBusy(false); } }
  }
  async function download(format: "docx" | "pdf") {
    if (!preview || stale || busyRef.current) return;
    busyRef.current = true; setExporting(format); setError(null);
    const controller = new AbortController(); reportRequest.current = controller;
    try {
      const response = await fetch(`/api/study-tools/export?format=${format}`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...preview.request, digest: preview.report.digest }), signal: controller.signal });
      if (!response.ok) {
        if (response.status === 409) setOutdated(true);
        const body = await response.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "تعذر تصدير التقرير.");
      }
      const blob = await response.blob(); if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `digital-leadership-report.${format}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تصدير التقرير."); }
    finally { if (!controller.signal.aborted) { busyRef.current = false; setExporting(null); } }
  }
  const visibleSources = catalog.sources.filter(source => source.subjectId === subjectId && (filter === "all" || source.kind === filter));

  return <div className={styles.reportWorkspace} dir="rtl">
    <div className={styles.reportBanner}><span className={styles.assistantSymbol}><PlatformIcon name="document" /></span><div><h1>التقارير الأكاديمية</h1><p>اختر مصادر دراستك، وراجع التقرير الموثّق، ثم صدّره بصيغة Word أو PDF.</p></div><Link href="/subjects?view=files" className={styles.back}>العودة إلى المصادر <PlatformIcon name="arrow" /></Link></div>
    <div className={styles.reportLayout}>
      <form className={styles.reportControls} onSubmit={generate}>
        <fieldset disabled={busy || Boolean(exporting)}><legend>إعداد التقرير</legend>
          <label htmlFor="report-title">عنوان التقرير</label><input id="report-title" value={title} maxLength={180} required minLength={3} onChange={event => setTitle(event.target.value)} />
          <label htmlFor="report-author">اسم معدّ التقرير (اختياري)</label><input id="report-author" value={author} maxLength={120} onChange={event => setAuthor(event.target.value)} />
          <label htmlFor="report-subject">المادة الدراسية</label><select id="report-subject" value={subjectId} onChange={event => { setSubjectId(event.target.value); setFilter("all"); }}>{initialCatalog.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select>
          <div className={styles.sourceFilters} aria-label="نوع المصادر"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>الكل</button>{Object.entries(kinds).map(([kind, label]) => <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => setFilter(kind as StudySourceKind)}>{label}</button>)}</div>
          <div className={styles.sourceList} aria-busy={loading}>
            {loading && !visibleSources.length ? <p role="status">جارٍ تحميل المصادر…</p> : visibleSources.map(source => <label key={sourceKey(source)} className={styles.sourceOption} data-selected={selected.some(item => sourceKey(item) === sourceKey(source))}><input type="checkbox" checked={selected.some(item => sourceKey(item) === sourceKey(source))} disabled={!source.ready || selected.length >= 20 && !selected.some(item => sourceKey(item) === sourceKey(source))} onChange={() => toggle(source)} /><span><strong>{source.title}</strong><small>{kinds[source.kind]}{!source.ready ? " · النص غير جاهز للتلخيص" : ""}</small></span></label>)}
            {!loading && !visibleSources.length && !sourceError ? <p>لا توجد مصادر متاحة في هذا التصنيف.</p> : null}
          </div>
          {catalog.sources.length < catalog.total ? <button type="button" className={styles.quiet} disabled={loading} onClick={() => void loadMore()}>عرض مصادر إضافية</button> : null}
          {sourceError ? <div className={styles.error} role="alert">{sourceError}<button type="button" className={styles.quiet} onClick={() => setRetry(value => value + 1)}>إعادة تحميل المصادر</button></div> : null}
          <div className={styles.selectionHead}><strong>المصادر المختارة ({selected.length}/20)</strong><button type="button" className={styles.quiet} disabled={!selected.length} onClick={() => setSelected([])}>إلغاء التحديد</button></div>
          <div className={styles.selectedSources}>{selected.map(source => <div key={sourceKey(source)}><span>{source.title}<small>{source.subjectTitle}</small></span><button type="button" className={styles.iconButton} aria-label={`إزالة ${source.title}`} onClick={() => toggle(source)}><PlatformIcon name="close" /></button></div>)}</div>
          <label htmlFor="report-notes">ملاحظاتك وتحليلك (اختياري)</label><textarea id="report-notes" value={notes} rows={4} maxLength={6000} onChange={event => setNotes(event.target.value)} placeholder="تظهر في قسم مستقل باسم ملاحظات معدّ التقرير." />
          <p className={styles.hint}>يمكن دمج مصادر من عدة مواد. تُدرج الواجبات بوصفها إرشادات، ويستخدم التوثيق بيانات المصدر المتاحة دون افتراض مؤلف أو تاريخ.</p>
          <button type="submit" className={styles.action} disabled={!selected.length || title.trim().length < 3}>{busy ? "جارٍ إعداد التقرير…" : "توليد ومعاينة التقرير"}<PlatformIcon name="document" /></button>
        </fieldset>
      </form>
      <section className={styles.reportPreview} aria-label="معاينة التقرير" aria-busy={busy}>
        <header className={styles.previewHeader}><h2>معاينة التقرير</h2><div className={styles.exportButtons}><button className={styles.quiet} disabled={!preview || stale || busy || Boolean(exporting)} onClick={() => void download("docx")}><PlatformIcon name="download" />{exporting === "docx" ? "جارٍ التصدير…" : "تصدير Word"}</button><button className={styles.action} disabled={!preview || stale || busy || Boolean(exporting)} onClick={() => void download("pdf")}><PlatformIcon name="download" />{exporting === "pdf" ? "جارٍ التصدير…" : "تصدير PDF"}</button></div></header>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {preview && stale ? <p className={styles.stale} role="status">تغيّر المحتوى أو الاختيار. أعد توليد المعاينة قبل التصدير.</p> : null}
        {preview ? <><div className={styles.previewTabs} role="tablist" aria-label="محتوى التقرير"><button role="tab" id="report-body-tab" aria-controls="report-body-panel" aria-selected={tab === "body"} onClick={() => setTab("body")}>التقرير</button><button role="tab" id="report-references-tab" aria-controls="report-references-panel" aria-selected={tab === "references"} onClick={() => setTab("references")}>المراجع APA7 ({preview.report.references.length})</button></div>
          {tab === "body" ? <div id="report-body-panel" role="tabpanel" aria-labelledby="report-body-tab" className={styles.reportBody}><div className={styles.reportCover}><span>تقرير أكاديمي · القيادة الرقمية</span><h2>{preview.report.title}</h2>{preview.report.author ? <p>{preview.report.author}</p> : null}</div><h3>مقدمة</h3><p>{preview.report.introduction}</p>{preview.report.sections.map(section => <details open key={`${section.sourceId}-${section.kind}`} className={styles.reportSection}><summary>{section.title}</summary>{section.kind === "assignment" ? <p className={styles.hint}>إرشادات الواجب المختار</p> : null}{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<p className={styles.inlineCitation}>{section.citation}</p></details>)}{preview.report.notes ? <><h3>ملاحظات معدّ التقرير</h3><p>{preview.report.notes}</p></> : null}</div> : <div id="report-references-panel" role="tabpanel" aria-labelledby="report-references-tab" className={styles.reportBody}><h3>المراجع</h3><p className={styles.hint}>تُستخدم «د.ت.» عند غياب التاريخ. تظهر عناوين المصادر في موضع المؤلف عندما لا يسجل المصدر اسم مؤلف.</p>{preview.report.references.map(reference => <div key={reference.sourceId} className={styles.reference}><p>{reference.formatted}</p><a href={reference.url} target="_blank" rel="noopener noreferrer">فتح المصدر <PlatformIcon name="arrow" /></a></div>)}</div>}
        </> : <div className={styles.emptyPreview}><PlatformIcon name="document" /><h3>تقريرك يبدأ من مصادره</h3><p>حدّد المحاضرات والملخصات والواجبات، ثم اضغط «توليد ومعاينة التقرير» لمراجعته قبل التحميل.</p></div>}
      </section>
    </div>
  </div>;
}
