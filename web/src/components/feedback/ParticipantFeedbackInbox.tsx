"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS, type ParticipantFeedback, type PaginatedResult, type FeedbackStatus } from "@digital-leadership/shared";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

class InboxError extends Error {
  constructor(readonly status: number) { super("تعذر إتمام العملية. حاول مرة أخرى."); }
}
async function inboxRequest(method: "GET" | "PATCH" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(`/api/participant-feedback${path}`, { method, cache: "no-store", ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new InboxError(response.status);
  return response.status === 204 ? null : await response.json();
}

function FeedbackCard({ item, save, remove }: { item: ParticipantFeedback; save: (id: string, status: FeedbackStatus, internalNote: string) => Promise<void>; remove: (id: string) => Promise<void> }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.internalNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function update() {
    setBusy(true); setError(null); setSaved(false);
    try { await save(item.id, status, note); setSaved(true); }
    catch { setError("تعذر حفظ التحديث. حاول مرة أخرى."); }
    finally { setBusy(false); }
  }
  return <article className="feedback-panel feedback-card" aria-label={`مشاركة ${item.authorName}`}>
    <div className="feedback-card-heading"><div><h2 dir="auto">{item.authorName}</h2><small className="feedback-muted">{item.authorKind === "guest" ? "زائر" : "مستخدم مسجل"} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Baghdad" })}</time></small></div><div className="feedback-badges"><span className="badge">{FEEDBACK_CATEGORY_LABELS[item.category]}</span><span className="badge" data-feedback-status={item.status}>{FEEDBACK_STATUS_LABELS[item.status]}</span></div></div>
    <p className="feedback-message" dir="auto">{item.message}</p>
    <fieldset disabled={busy} className="feedback-card-management"><div className="form-field"><label className="form-label" htmlFor={`feedback-status-${item.id}`}>حالة الرد</label><select className="form-input" id={`feedback-status-${item.id}`} value={status} onChange={event => { setStatus(event.target.value as FeedbackStatus); setSaved(false); }}>{FEEDBACK_STATUSES.map(value => <option key={value} value={value}>{FEEDBACK_STATUS_LABELS[value]}</option>)}</select></div><div className="form-field"><label className="form-label" htmlFor={`feedback-note-${item.id}`}>ملاحظة داخلية للمدير والمدرب</label><textarea id={`feedback-note-${item.id}`} className="form-input" rows={2} maxLength={3000} value={note} onChange={event => { setNote(event.target.value); setSaved(false); }} /></div><div className="feedback-actions"><button type="button" className="btn" onClick={update} disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ التحديث"}</button><ConfirmButton label="حذف الرد" confirmTitle="حذف الرد نهائيًا؟" confirmMessage="سيتم حذف هذه المشاركة. لا يمكن التراجع عن الحذف." onConfirm={() => remove(item.id)} confirmLabel="حذف" cancelLabel="إلغاء" busyLabel="جارٍ الحذف…" errorMessage="تعذر حذف الرد. حاول مرة أخرى." />{saved ? <span role="status">تم حفظ التحديث</span> : null}</div>{error ? <p role="alert" className="feedback-error">{error}</p> : null}</fieldset>
  </article>;
}

export function ParticipantFeedbackInbox({ initial }: { initial: PaginatedResult<ParticipantFeedback> }) {
  const [result, setResult] = useState(initial);
  const [filters, setFilters] = useState({ status: "", category: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0);
  const current = useRef({ filters, page: initial.page });
  function failure(cause: unknown) {
    if (cause instanceof InboxError && (cause.status === 401 || cause.status === 403)) { setDenied(true); setResult({ data: [], page: 1, limit: 20, total: 0 }); }
    setError("تعذر تحميل الردود. حاول مرة أخرى.");
  }
  async function load(page: number, nextFilters = current.current.filters) {
    current.current = { filters: nextFilters, page };
    const requestId = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), limit: "20" });
      if (nextFilters.status) query.set("status", nextFilters.status);
      if (nextFilters.category) query.set("category", nextFilters.category);
      const data = await inboxRequest("GET", `?${query}`) as PaginatedResult<ParticipantFeedback>;
      if (requestId === sequence.current) {
        // Deleting the final row on a later page should return to a page
        // that still exists, without losing the selected filters.
        if (!data.data.length && data.total > 0 && page > 1) { await load(Math.ceil(data.total / data.limit), nextFilters); return; }
        setResult(data);
      }
    } catch (cause) { if (requestId === sequence.current) failure(cause); }
    finally { if (requestId === sequence.current) setLoading(false); }
  }
  async function mutate(method: "PATCH" | "DELETE", id: string, body?: unknown) {
    setNotice(null);
    try { await inboxRequest(method, `/${encodeURIComponent(id)}`, body); }
    catch (cause) { failure(cause); throw cause; }
    setNotice(method === "PATCH" ? "تم حفظ التحديث" : "تم حذف الرد");
    await load(current.current.page);
  }
  if (denied) return <section className="participant-feedback feedback-panel" dir="rtl"><h1>آراء المشاركين</h1><p role="alert">هذه النافذة متاحة للمدير والمدرب فقط.</p><Link className="btn btn-secondary" href="/dashboard">الرجوع إلى الرئيسية</Link></section>;
  return <section className="participant-feedback feedback-inbox" dir="rtl">
    <header className="feedback-heading"><span className="feedback-heading-icon"><PlatformIcon name="clipboard" /></span><div><h1>آراء المشاركين</h1><p>ردود خاصة لا يطّلع عليها سوى المدير والمدرب.</p></div></header>
    <div className="feedback-panel feedback-inbox-tools"><div className="form-field"><label className="form-label" htmlFor="feedback-filter-status">الحالة</label><select id="feedback-filter-status" className="form-input" value={filters.status} onChange={event => { const next = { ...filters, status: event.target.value }; setFilters(next); void load(1, next); }}><option value="">جميع الحالات</option>{FEEDBACK_STATUSES.map(value => <option key={value} value={value}>{FEEDBACK_STATUS_LABELS[value]}</option>)}</select></div><div className="form-field"><label className="form-label" htmlFor="feedback-filter-category">نوع المشاركة</label><select id="feedback-filter-category" className="form-input" value={filters.category} onChange={event => { const next = { ...filters, category: event.target.value }; setFilters(next); void load(1, next); }}><option value="">جميع المشاركات</option>{FEEDBACK_CATEGORIES.map(value => <option key={value} value={value}>{FEEDBACK_CATEGORY_LABELS[value]}</option>)}</select></div><button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load(current.current.page)}>تحديث القائمة</button><span className="feedback-muted">عدد الردود: {result.total.toLocaleString("ar")}</span></div>
    {error ? <p role="alert" className="feedback-error">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {loading ? <p role="status">جارٍ تحميل الردود…</p> : null}
    {!loading && !error && result.data.length === 0 ? <div className="feedback-panel"><p>لا توجد ردود ضمن هذه الخيارات.</p></div> : null}
    <div className="feedback-list" aria-busy={loading}>{result.data.map(item => <FeedbackCard key={`${item.id}:${item.updatedAt}`} item={item} save={(id, status, internalNote) => mutate("PATCH", id, { status, internalNote })} remove={id => mutate("DELETE", id)} />)}</div>
    {result.total > result.limit ? <nav className="feedback-pagination" aria-label="صفحات آراء المشاركين"><button type="button" className="btn btn-secondary" disabled={loading || result.page <= 1} onClick={() => void load(result.page - 1)}>الصفحة السابقة</button><span>صفحة {result.page.toLocaleString("ar")} من {Math.ceil(result.total / result.limit).toLocaleString("ar")}</span><button type="button" className="btn btn-secondary" disabled={loading || result.page * result.limit >= result.total} onClick={() => void load(result.page + 1)}>الصفحة التالية</button></nav> : null}
    <Link className="feedback-back" href="/dashboard">← الرجوع إلى الرئيسية</Link>
  </section>;
}
