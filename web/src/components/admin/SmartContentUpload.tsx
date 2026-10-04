"use client";

import { useEffect, useRef, useState } from "react";
import type { ContentImport } from "@shared/index";

const stages: Record<string, string> = { uploading: "بانتظار اكتمال الرفع", queued: "بانتظار المعالجة", reading: "قراءة المحتوى", classifying: "تحديد المادة والمحاضرات", generating: "إنشاء الأسئلة والإجابات", saving: "حفظ المحتوى وتحديث الاختبارات", completed: "اكتمل التحديث", failed: "تحتاج المعالجة إلى إعادة المحاولة" };
type Limits = { maxPdfBytes: number; partBytes: number; maxTextCharacters: number };

async function jsonRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/content-imports${path}`, { ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "تعذر إتمام الطلب. أعد المحاولة.");
  return result.data as T;
}

export function SmartContentUpload() {
  const [jobs, setJobs] = useState<ContentImport[] | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const jobsRef = useRef<ContentImport[]>([]);
  const limitsRef = useRef<Limits | null>(null);

  useEffect(() => {
    let active = true;
    let lastRefresh = 0;
    const load = async () => {
      try {
        const [imports, config] = await Promise.all([jsonRequest<ContentImport[]>(""), limitsRef.current ? Promise.resolve(limitsRef.current) : jsonRequest<Limits>("/limits")]);
        if (active) {
          if (imports.some(job => job.status === "completed" && jobsRef.current.some(previous => previous.id === job.id && previous.status !== "completed"))) window.dispatchEvent(new Event("content-import-completed"));
          const incoming = new Set(imports.map(job => job.id));
          const merged = [...imports, ...jobsRef.current.filter(job => !incoming.has(job.id) && Date.now() - Date.parse(job.createdAt) < 15_000)];
          jobsRef.current = merged; limitsRef.current = config;
          setJobs(merged); setLimits(config); setLoadError(null); lastRefresh = Date.now();
        }
      } catch { if (active) setLoadError("تعذر تحميل حالة التحديث. حاول مجددًا."); }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (jobsRef.current.some(job => job.status === "queued" || job.status === "processing") || Date.now() - lastRefresh >= 60_000) void load();
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  function remember(job: ContentImport) { const next = [job, ...jobsRef.current.filter(item => item.id !== job.id)]; jobsRef.current = next; setJobs(next); }

  async function uploadPdf(file: File) {
    if (!limits) throw new Error("انتظر اكتمال تحميل إعدادات الرفع.");
    if (!/\.pdf$/i.test(file.name) || file.size === 0 || file.size > limits.maxPdfBytes) throw new Error(`اختر ملف PDF لا يتجاوز ${Math.round(limits.maxPdfBytes / (1024 * 1024))} ميجابايت.`);
    setProgress(`تجهيز ${file.name}`);
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const job = await jsonRequest<ContentImport>("/uploads", { filename: file.name, size: file.size, sha256 });
    remember(job);
    if (job.status !== "uploading") return;
    for (let part = 0; part < job.uploadPartCount; part++) {
      const start = part * limits.partBytes;
      const response = await fetch(`/api/admin/content-upload/${job.id}/${part}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file.slice(start, Math.min(file.size, start + limits.partBytes)) });
      if (!response.ok) throw new Error("تعذر إكمال رفع الملف. أعد اختياره للمحاولة مرة أخرى؛ الأجزاء المرفوعة محفوظة.");
      setProgress(`رفع ${file.name}: ${Math.round((part + 1) / job.uploadPartCount * 100)}٪`);
    }
    remember(await jsonRequest<ContentImport>(`/${job.id}/complete`, {}));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "pdf" && !files.length) { setError("اختر ملف PDF واحدًا أو أكثر."); return; }
    if (mode === "text" && text.trim().split(/\s+/).length < 25) { setError("أدخل نص المحاضرة كاملًا؛ يلزم 25 كلمة على الأقل."); return; }
    setBusy(true);
    try {
      if (mode === "pdf") {
        for (const file of files) await uploadPdf(file);
        setFiles([]);
        if (fileInput.current) fileInput.current.value = "";
      } else {
        remember(await jsonRequest<ContentImport>("", { text, ...(title.trim() ? { title: title.trim() } : {}) }));
        setText(""); setTitle("");
      }
      setProgress("تم الحفظ. تُحدَّث المادة والاختبارات تلقائيًا في الخلفية.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "تعذر حفظ المحتوى. أعد المحاولة."); }
    finally { setBusy(false); }
  }

  async function retry(id: string) {
    try { remember(await jsonRequest<ContentImport>(`/${id}/retry`, {})); setError(null); }
    catch { setError("تعذرت إعادة المعالجة. حاول مجددًا."); }
  }

  return <div className="smart-content">
    <div className="smart-content-intro">
      <h2>إضافة ذكية للمحتوى الدراسي</h2>
      <p>أضف المحاضرة أو ملفات PDF. تُحدَّد المادة تلقائيًا، ويُحفظ المحتوى في محاضرته، وتُضاف أسئلته وإجاباتها إلى اختبار المادة واختبار المحاضرة.</p>
    </div>
    <form className="admin-form smart-content-form" onSubmit={submit}>
      <div className="smart-content-modes" role="group" aria-label="نوع المحتوى">
        <button type="button" className={`btn ${mode === "pdf" ? "" : "btn-secondary"}`} aria-pressed={mode === "pdf"} disabled={busy} onClick={() => setMode("pdf")}>ملفات PDF</button>
        <button type="button" className={`btn ${mode === "text" ? "" : "btn-secondary"}`} aria-pressed={mode === "text"} disabled={busy} onClick={() => setMode("text")}>نص محاضرة</button>
      </div>
      {mode === "pdf" ? <div className="form-field">
        <label className="form-label" htmlFor="smart-pdfs">المحاضرات والملفات الجديدة</label>
        <input ref={fileInput} id="smart-pdfs" className="form-input" type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={event => setFiles(Array.from(event.target.files ?? []))} />
        <p className="field-help">يمكن اختيار عدة ملفات. {limits ? `الحد الأقصى لكل ملف ${Math.round(limits.maxPdfBytes / 1048576)} ميجابايت.` : ""} تدعم القراءة ملفات PDF النصية والمصوّرة.</p>
        {files.length ? <p>{files.map(file => file.name).join("، ")}</p> : null}
      </div> : <>
        <div className="form-field"><label className="form-label" htmlFor="smart-title">عنوان المحاضرة (اختياري)</label><input id="smart-title" className="form-input" maxLength={200} disabled={busy} value={title} onChange={event => setTitle(event.target.value)} placeholder="يُستخرج من المحتوى عند تركه فارغًا" /></div>
        <div className="form-field"><label className="form-label" htmlFor="smart-text">نص المحاضرة</label><textarea id="smart-text" className="form-input" rows={9} maxLength={limits?.maxTextCharacters ?? 500000} disabled={busy} value={text} onChange={event => setText(event.target.value)} placeholder="الصق محتوى المحاضرة هنا…" required /></div>
      </>}
      <button className="btn btn-gold" type="submit" disabled={busy || !limits}>{busy ? "جارٍ حفظ المحتوى…" : "إضافة وتحديث الاختبارات تلقائيًا"}</button>
      {progress ? <p role="status" aria-live="polite">{progress}</p> : null}
      {error ? <p className="smart-content-error" role="alert">{error}</p> : null}
    </form>
    <div className="smart-content-history">
      <h2>متابعة تحديث المواد</h2>
      {loadError ? <p role="alert">{loadError}</p> : null}
      {jobs === null ? <p role="status">جارٍ تحميل التحديثات…</p> : jobs.length === 0 ? <p>ستظهر المحاضرات والملفات المضافة هنا مع مادتها وأسئلتها.</p> : <div className="smart-import-list">{jobs.map(job => <article className={`smart-import smart-import-${job.status}`} key={job.id}>
        <div className="smart-import-head"><h3>{job.title}</h3><span className="badge">{stages[job.stage] ?? stages[job.status]}</span></div>
        {job.filename ? <p className="smart-import-filename">{job.filename}</p> : null}
        {job.subjectTitle ? <p>المادة: <strong>{job.subjectTitle}</strong></p> : null}
        {job.status === "completed" ? <>
          <p>أُضيفت {job.lectures.length} محاضرة أو حُدِّث محتواها، مع {job.questionCount} سؤالًا وإجاباتها وتغذيتها الراجعة.</p>
          <ul>{job.lectures.map(lecture => <li key={lecture.id}><a href={`/subjects/${job.subjectId}/lectures/${lecture.id}`}>{lecture.title}</a><span> · {lecture.questionCount} سؤالًا · </span><a href={`/quizzes/${lecture.quizId}`}>اختبار المحاضرة</a></li>)}</ul>
          <a className="btn btn-secondary" href={`/subjects/${job.subjectId}/assessments`}>عرض اختبارات المادة</a>
        </> : null}
        {job.status === "uploading" ? <p>اختر الملف نفسه لاستكمال الرفع إذا توقفت العملية.</p> : null}
        {job.errorMessage ? <p role="alert">{job.errorMessage}</p> : null}
        <div className="smart-import-actions">{job.status === "failed" ? <button type="button" className="btn btn-secondary" onClick={() => void retry(job.id)}>إعادة المعالجة</button> : null}{job.filename && job.status !== "uploading" ? <a href={`/api/admin/content-source/${job.id}`}>تنزيل الملف الأصلي</a> : null}</div>
      </article>)}</div>}
    </div>
  </div>;
}
