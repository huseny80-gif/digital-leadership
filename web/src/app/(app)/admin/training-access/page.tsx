"use client";

import { useEffect, useState } from "react";
import type { TrainingAccessGrant, TrainingAccessGrantCreated, TrainingAccessShareLink, GuestTraineeAnalyticsRow } from "@shared/index";
import { adminGet, adminPost } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { TrainingAccessQrCode } from "@/components/admin/TrainingAccessQrCode";
import { GuestTraineeDashboard } from "@/components/admin/GuestTraineeDashboard";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { guestDate, guestNumber } from "@/lib/guestAnalytics";

/** Admin-only lists never carry tokens; the selected link uses a dedicated
 * no-store endpoint which returns the same saved URL on subsequent visits. */
export default function TrainingAccessPage() {
  const [grants, setGrants] = useState<TrainingAccessGrant[] | null>(null);
  const [guests, setGuests] = useState<GuestTraineeAnalyticsRow[]>([]);
  const [asOf, setAsOf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [showQr, setShowQr] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const selected = grants?.find(grant => grant.id === selectedId);

  async function load() {
    setError(null);
    try {
      const [grantData, guestData] = await Promise.all([
        adminGet<TrainingAccessGrant[]>("training-access"),
        adminGet<GuestTraineeAnalyticsRow[]>("training-access/guests"),
      ]);
      const active = grantData.filter(grant => !grant.revoked);
      setGrants(active);
      setGuests(guestData);
      setAsOf(new Date().toISOString());
      const preferred = [...active].sort((a, b) => b.sessionCount - a.sessionCount || b.createdAt.localeCompare(a.createdAt))[0];
      setSelectedId(current => active.some(grant => grant.id === current) ? current : preferred?.id ?? "");
    } catch { setError("تعذر تحميل روابط الدخول وإحصاءات الزوار. أعد المحاولة."); }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  // Retrieve before the copy gesture so Safari can use the clipboard without
  // losing user activation while waiting for a network request.
  useEffect(() => {
    if (!selectedId || links[selectedId]) return;
    let ignore = false;
    adminPost<TrainingAccessShareLink>(`training-access/${selectedId}/link`).then(result => {
      if (!ignore) { setLinks(current => ({ ...current, [selectedId]: result.joinUrl })); setLinkError(null); }
    }).catch(() => { if (!ignore) setLinkError("تعذر استرجاع الرابط. اضغط على عرض الرابط وQR لإعادة المحاولة."); });
    return () => { ignore = true; };
  }, [selectedId, links]);

  async function share(id: string, copy: boolean) {
    setBusyId(id); setLinkError(null); setNotice(null); setSelectedId(id);
    try {
      const url = links[id] ?? (await adminPost<TrainingAccessShareLink>(`training-access/${id}/link`)).joinUrl;
      setLinks(current => ({ ...current, [id]: url }));
      if (copy) {
        try { await navigator.clipboard.writeText(url); setNotice("تم نسخ الرابط بنجاح. يمكنك مشاركته مع المتدربين والزوار."); }
        catch { setNotice("الرابط جاهز. تعذر النسخ التلقائي؛ حدده من الحقل وانسخه يدويًا."); }
      } else { setShowQr(true); }
    } catch { setLinkError("تعذر استرجاع الرابط. تأكد من أنه مفعّل وأعد المحاولة."); }
    finally { setBusyId(null); }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault(); setSubmitting(true); setFormError(null);
    try {
      const created = await adminPost<TrainingAccessGrantCreated>("training-access", { label: label.trim() || null, description: null, maxSessions: null });
      setLinks(current => ({ ...current, [created.id]: created.joinUrl }));
      await load(); setSelectedId(created.id); setShowQr(true);
      setLabel(""); setFormOpen(false); setNotice("تم إنشاء الرابط وحفظه. يمكنك العودة لنسخه في أي وقت.");
    } catch { setFormError("تعذر إنشاء رابط الدخول. أعد المحاولة."); }
    finally { setSubmitting(false); }
  }

  async function handleRevoke(id: string) {
    await adminPost(`training-access/${id}/revoke`);
    setShowQr(false); setNotice("تم تعطيل الرابط وإزالته من القائمة مع حفظ جلسات المتدربين ونتائجهم.");
    await load();
  }

  async function clean() {
    setCleaning(true); setLinkError(null);
    try {
      await adminPost<{ removed: number }>("training-access/cleanup"); await load();
      setNotice("تم تنظيف السجلات المعطلة. بيانات المتدربين ونتائجهم محفوظة.");
    } catch { setLinkError("تعذر تنظيف السجلات. أعد المحاولة."); }
    finally { setCleaning(false); }
  }

  return <section className="dl-access-page" dir="rtl">
    <div className="dl-access-heading"><div><span className="dl-access-eyebrow">إدارة المشاركة والمتابعة</span><h1>دخول المتدربين والزوار</h1></div><button type="button" className="btn btn-secondary" onClick={() => setFormOpen(value => !value)}>{formOpen ? "إلغاء" : "رابط دخول جديد"}</button></div>
    <p className="page-subheading">الدخول عبر الرابط أو رمز QR متاح دائمًا للتصفح وإجراء الاختبارات التدريبية، دون تحديد ساعات أو أيام.</p>

    {formOpen && <form className="admin-form dl-access-glass" onSubmit={handleCreate}><div className="form-field"><label className="form-label" htmlFor="grant-label">اسم الرابط (اختياري)</label><input id="grant-label" className="form-input" maxLength={200} value={label} onChange={event => setLabel(event.target.value)} placeholder="مثل: رابط المنصة للمتدربين" /></div>{formError && <p role="alert" className="dl-access-error">{formError}</p>}<button type="submit" className="btn" disabled={submitting}>{submitting ? "جارٍ الإنشاء…" : "إنشاء رابط الدخول"}</button></form>}
    {error && <ErrorState message={error} retryHref="/admin/training-access" />}
    {!error && grants === null && <LoadingState label="جارٍ تحميل الروابط وإحصاءات الزوار…" />}

    {!error && grants && <>
      <section className="dl-access-glass dl-access-share" aria-labelledby="published-link-heading">
        <div className="dl-access-share-intro"><span className="dl-access-share-icon"><PlatformIcon name="globe" /></span><div><h2 id="published-link-heading">رابط الدخول المنشور</h2><p>انسخ الرابط المحفوظ وشاركه متى شئت. الروابط المتداولة تبقى صالحة حتى تعطيلها.</p></div><span className="dl-access-chip">دخول دائم</span></div>
        {grants.length ? <>
          <div className="dl-access-share-controls"><label htmlFor="published-grant">اختر الرابط<select id="published-grant" value={selectedId} onChange={event => { setSelectedId(event.target.value); setShowQr(false); setNotice(null); setLinkError(null); }}>{grants.map((grant, index) => <option key={grant.id} value={grant.id}>{grant.label || `رابط الدخول ${guestNumber(index + 1)}`} · {guestNumber(grant.sessionCount)} جلسة</option>)}</select></label><button type="button" className="btn" disabled={busyId !== null || !selected} onClick={() => void share(selectedId, true)}><PlatformIcon name="clipboard" />{busyId === selectedId ? "جارٍ التحضير…" : "نسخ الرابط"}</button><button type="button" className="btn btn-secondary" disabled={busyId !== null || !selected} onClick={() => void share(selectedId, false)}>عرض الرابط وQR</button></div>
          {links[selectedId] && <input className="dl-access-url" aria-label="رابط الدخول المحفوظ" readOnly dir="ltr" value={links[selectedId]} onFocus={event => event.target.select()} />}
          {showQr && links[selectedId] && <div className="dl-access-qr"><TrainingAccessQrCode joinUrl={links[selectedId]} label={selected?.label ?? "القيادة الرقمية"} /><p>يمكن للمتدرب مسح الرمز والدخول إلى المنصة. الرمز يحمل رابط الدخول نفسه.</p><button className="btn btn-secondary" type="button" onClick={() => setShowQr(false)}>إخفاء QR</button></div>}
        </> : <EmptyState title="لا توجد روابط مفعّلة" message="أنشئ رابط دخول ليتمكن المتدربون والزوار من الوصول إلى المنصة." />}
        {notice && <p role="status" className="dl-access-notice">{notice}</p>}{linkError && <p role="alert" className="dl-access-error">{linkError}</p>}
      </section>

      <details className="dl-access-glass dl-access-link-list"><summary>إدارة روابط الدخول <span>{guestNumber(grants.length)} روابط مفعّلة</span><PlatformIcon name="chevron" /></summary><div className="dl-access-list-actions"><p>تُعرض الروابط المفعّلة فقط. تنظيف السجلات لا يحذف تقدم المتدربين أو نتائجهم.</p><button type="button" className="btn btn-secondary" disabled={cleaning} onClick={() => void clean()}>{cleaning ? "جارٍ التنظيف…" : "تنظيف السجلات المعطلة"}</button></div>
        <div className="dl-guest-table-scroll" role="region" aria-label="روابط الدخول المفعلة" tabIndex={0}><table className="dl-guest-table dl-access-grants"><thead><tr><th scope="col">اسم الرابط</th><th scope="col">الجلسات</th><th scope="col">الصلاحية</th><th scope="col">تاريخ الإنشاء (UTC)</th><th scope="col">الإجراءات</th></tr></thead><tbody>{grants.map((grant, index) => <tr key={grant.id}><td>{grant.label || `رابط الدخول ${guestNumber(index + 1)}`}</td><td>{guestNumber(grant.sessionCount)}</td><td><span className="dl-guest-badge dl-guest-badge-active">مفعّل</span><small className="dl-access-permanent">دائم — دون تاريخ انتهاء</small></td><td>{guestDate(grant.createdAt, true)}</td><td><div className="dl-access-row-actions"><button type="button" className="btn btn-secondary" aria-label={`نسخ رابط ${grant.label || guestNumber(index + 1)}`} disabled={busyId !== null} onClick={() => void share(grant.id, true)}>نسخ</button><button type="button" className="btn btn-secondary" aria-label={`عرض QR ${grant.label || guestNumber(index + 1)}`} disabled={busyId !== null} onClick={() => void share(grant.id, false)}>QR</button><ConfirmButton label="تعطيل" confirmTitle="تعطيل رابط الدخول؟" confirmMessage="سيتوقف دخول الزوار الجدد عبر هذا الرابط. جلسات المتدربين الحاليين ونتائجهم ستبقى محفوظة." confirmLabel="تعطيل الرابط" cancelLabel="إلغاء" busyLabel="جارٍ التعطيل…" errorMessage="تعذر تعطيل الرابط. أعد المحاولة." onConfirm={() => handleRevoke(grant.id)} /></div></td></tr>)}</tbody></table></div>
      </details>
      {asOf && <GuestTraineeDashboard rows={guests} asOf={asOf} />}
    </>}
  </section>;
}
