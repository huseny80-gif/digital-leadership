"use client";

import { useRef, useState, type FormEvent } from "react";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS, type FeedbackCategory } from "@digital-leadership/shared";

export function FeedbackForm() {
  const [category, setCategory] = useState<FeedbackCategory>("opinion");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Retrying a request whose acknowledgement was lost must not create a
  // second response. The key exists only in this mounted form's memory.
  const pending = useRef<{ fingerprint: string; submissionId: string } | null>(null);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError(null);
    const payload = { category, name: name.trim(), message: message.trim() };
    if (!payload.message) { setError("اكتب رأيك أو ملاحظتك قبل الإرسال."); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const fingerprint = JSON.stringify(payload);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, submissionId: crypto.randomUUID() };
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, submissionId: pending.current.submissionId }), cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.data?.received !== true) {
        setError(response.status === 401 ? "تعذر التحقق من جلسة الدخول. افتح رابط المنصة مجددًا ثم حاول الإرسال." : response.status === 429 ? "أرسلت عدة آراء خلال وقت قصير. يرجى المحاولة لاحقًا." : "تعذر إرسال ردك. ملاحظتك محفوظة في هذه الصفحة؛ حاول مرة أخرى.");
        return;
      }
      pending.current = null;
      setName(""); setMessage(""); setCategory("opinion"); setReceived(true);
    } catch {
      setError("تعذر إرسال ردك. ملاحظتك محفوظة في هذه الصفحة؛ تحقق من الاتصال وحاول مرة أخرى.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (received) return <div className="feedback-success">
    <p role="status" aria-live="polite">تم استلام ردك بنجاح</p>
    <p>شكرًا لمشاركتك. سيطّلع المدير أو المدرب على ردك بسرية.</p>
    <button type="button" className="btn btn-secondary" onClick={() => setReceived(false)}>إرسال رأي آخر</button>
  </div>;

  return <form className="participant-feedback-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <div className="feedback-form-row">
        <div className="form-field"><label className="form-label" htmlFor="feedback-category">نوع المشاركة</label><select id="feedback-category" className="form-input" value={category} onChange={event => setCategory(event.target.value as FeedbackCategory)}>{FEEDBACK_CATEGORIES.map(value => <option key={value} value={value}>{FEEDBACK_CATEGORY_LABELS[value]}</option>)}</select></div>
        <div className="form-field"><label className="form-label" htmlFor="feedback-name">الاسم <span className="feedback-muted">(اختياري)</span></label><input id="feedback-name" className="form-input" value={name} maxLength={120} autoComplete="name" onChange={event => setName(event.target.value)} /></div>
      </div>
      <div className="form-field"><label className="form-label" htmlFor="feedback-message">رأيك أو ملاحظتك</label><textarea id="feedback-message" className="form-input" rows={7} required maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} placeholder="شاركنا رأيك، أو اقتراحك للتطوير، أو أي نقطة ضعف لاحظتها في المنصة…" aria-describedby="feedback-privacy feedback-counter" /><small id="feedback-counter" className="feedback-muted">{message.length.toLocaleString("ar")} / {Number(5000).toLocaleString("ar")} حرف</small></div>
      {error ? <p className="feedback-error" role="alert">{error}</p> : null}
      <button type="submit" className="btn feedback-submit" disabled={busy}>{busy ? "جارٍ الإرسال…" : "تم"}</button>
    </fieldset>
  </form>;
}
