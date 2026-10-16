"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SubjectPdfDocument } from "@/lib/content/subjectPdf";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./subjectPdf.module.css";

const normalize = (value: string) => value.normalize("NFKC").replace(/[\u064b-\u065f\u0670]/gu, "").replace(/[أإآ]/gu, "ا").toLowerCase();

function PdfFile({ document, subjectId }: { document: SubjectPdfDocument; subjectId: string }) {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const catalogUrl = `/api/library/${subjectId}/${document.fileId}`;
  const url = document.source === "catalog" ? catalogUrl : signed?.url;
  const downloadUrl = document.source === "catalog" ? catalogUrl
    : `/api/files/${document.fileId}?download=1&filename=${encodeURIComponent(document.filename)}`;
  const title = document.title.replace(/\.pdf$/iu, "").trim();

  async function open() {
    if (opened) { setOpened(false); return; }
    setError(null);
    if (document.source === "catalog" || signed && Date.parse(signed.expiresAt) > Date.now()) { setOpened(true); return; }
    const controller = new AbortController(); pending.current = controller; setLoading(true);
    try {
      const response = await fetch(`/api/files/${document.fileId}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || typeof body.data?.url !== "string" || !/^https?:\/\//iu.test(body.data.url) || !(Date.parse(body.data.expiresAt) > Date.now())) throw new Error("unavailable");
      if (!controller.signal.aborted) { setSigned(body.data); setOpened(true); }
    } catch { if (!controller.signal.aborted) setError("تعذّر فتح الملف. أعد المحاولة."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  return <article className={styles.file}>
    <div className={styles.fileHead}><span className={styles.pdfIcon}><PlatformIcon name="document" /><b>PDF</b></span><div><h3 title={document.filename}>{title}</h3><small>{(document.sizeBytes / 1024 / 1024).toLocaleString("ar-IQ", { maximumFractionDigits: 2 })} ميغابايت</small></div></div>
    <div className={styles.actions}>
      <button type="button" className="btn btn-secondary" aria-expanded={opened} aria-busy={loading} title={opened ? "إغلاق المعاينة" : "عرض الملف"} disabled={loading} onClick={open}>عرض</button>
      <a className="btn btn-secondary" href={downloadUrl} download={document.filename} target="_blank" rel="noopener noreferrer"><PlatformIcon name="download" /> تحميل</a>
      {document.lectureId ? <Link className="btn btn-secondary" href={`/subjects/${subjectId}/lectures/${document.lectureId}`}>فتح المحاضرة</Link> : null}
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {opened && url ? <div className={styles.preview}><iframe src={document.source === "catalog" ? `${url}?inline=1` : url} title={`معاينة ${title}`} loading="lazy" /></div> : null}
  </article>;
}

export function SubjectPdfLibrary({ subjectId, documents }: { subjectId: string; documents: SubjectPdfDocument[] }) {
  const [query, setQuery] = useState("");
  const filtered = documents.filter(document => normalize([document.title, document.filename, document.lectureTitle].join(" ")).includes(normalize(query.trim())));
  const groups = new Map<string, { title: string; documents: SubjectPdfDocument[] }>();
  for (const document of filtered) {
    const id = document.lectureId ?? "resources", group = groups.get(id) ?? { title: document.lectureTitle ?? "ملفات المادة ومراجعها", documents: [] };
    group.documents.push(document); groups.set(id, group);
  }
  return <div className={styles.library}>
    <div className={styles.toolbar}><label><PlatformIcon name="search" /><span className="sr-only">البحث في ملفات PDF</span><input type="search" placeholder="ابحث باسم الملف أو المحاضرة…" aria-label="البحث في ملفات PDF" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} /></label><span role="status">{filtered.length.toLocaleString("ar-IQ")} ملف PDF</span></div>
    {[...groups].map(([id, group]) => <section key={id} className={styles.group}><h2><PlatformIcon name="folder" /> {group.title}</h2><div className={styles.fileGrid}>{group.documents.map(document => <PdfFile key={document.id} document={document} subjectId={subjectId} />)}</div></section>)}
    {!filtered.length ? <p className={styles.empty}>{query ? "لا توجد ملفات مطابقة للبحث." : "ستظهر ملفات PDF هنا عند إضافتها ونشرها في هذه المادة."}</p> : null}
  </div>;
}
