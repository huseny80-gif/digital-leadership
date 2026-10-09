"use client";

import { useState } from "react";
import type { GuestTraineeAnalyticsRow } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { filterGuests, guestDate, guestDay, guestEntryTrend, guestNumber, guestStatusLabels, guestSummary, lectureProgress, sortGuests, type GuestSort, type GuestStatusFilter } from "@/lib/guestAnalytics";

const statuses = ["active", "expired", "revoked"] as const;

export function GuestTraineeDashboard({ rows, asOf }: { rows: GuestTraineeAnalyticsRow[]; asOf: string }) {
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(0);
  const [status, setStatus] = useState<GuestStatusFilter>("all");
  const [day, setDay] = useState<string | null>(null);
  const [sort, setSort] = useState<GuestSort>("lastSeen");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const cohort = filterGuests(rows, query, days, asOf);
  const summary = guestSummary(cohort);
  const trend = guestEntryTrend(cohort, asOf);
  const max = Math.max(1, ...trend.map(item => item.count));
  const filtered = sortGuests(cohort.filter(row => (status === "all" || row.status === status) && (!day || guestDay(row.joinedAt) === day)), sort);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeEnd = summary.sessions ? summary.active / summary.sessions * 100 : 0;
  const expiredEnd = summary.sessions ? (summary.active + summary.expired) / summary.sessions * 100 : 0;
  function chooseStatus(value: GuestStatusFilter) { setStatus(value); setPage(1); }
  function reset() { setQuery(""); setDays(0); setStatus("all"); setDay(null); setSort("lastSeen"); setPage(1); }
  const metrics = [
    { label: "جلسات الزوار", value: summary.sessions, icon: "users", color: "cyan" },
    { label: "جلسات نشطة", value: summary.active, icon: "user", color: "green" },
    { label: "إنجازات المحاضرات", value: summary.lectures, icon: "book", color: "purple" },
    { label: "محاولات اختبار مكتملة", value: summary.quizzes, icon: "quiz", color: "orange" },
  ];

  return <section className="dl-guest-dashboard" aria-labelledby="guest-dashboard-heading">
    <div className="dl-access-heading">
      <div><span className="dl-access-eyebrow">متابعة التعلم</span><h2 id="guest-dashboard-heading">المتدربون الزوار</h2><p>كل صف يمثل جلسة دخول مستقلة. الإحصاءات تعكس السجلات المطابقة للبحث والفترة المحددة.</p></div>
      <span className="dl-access-chip"><PlatformIcon name="clock" />آخر تحديث: {guestDate(asOf, true)}</span>
    </div>

    <div className="dl-guest-filters dl-access-glass">
      <label className="dl-guest-search"><span className="sr-only">البحث باسم المتدرب</span><PlatformIcon name="search" /><input type="search" placeholder="ابحث باسم المتدرب…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      <label>فترة الانضمام<select aria-label="فترة الانضمام" value={days} onChange={event => { setDays(Number(event.target.value)); setDay(null); setPage(1); }}><option value={0}>كل الفترات</option><option value={7}>آخر ٧ أيام</option><option value={30}>آخر ٣٠ يومًا</option></select></label>
      <button className="btn btn-secondary" type="button" onClick={reset}>إعادة ضبط</button>
    </div>

    <div className="dl-guest-metrics">{metrics.map(metric => <article className={`dl-access-glass dl-guest-metric dl-guest-${metric.color}`} key={metric.label}><span className="dl-guest-metric-icon"><PlatformIcon name={metric.icon} /></span><div><span>{metric.label}</span><strong>{guestNumber(metric.value)}</strong></div></article>)}</div>

    <div className="dl-guest-charts">
      <section className="dl-access-glass dl-guest-chart" aria-labelledby="guest-trend-heading">
        <h3 id="guest-trend-heading">اتجاه دخول الزوار</h3><p>الجلسات الجديدة خلال آخر ١٤ يومًا · اضغط على يوم لتصفية الجدول</p>
        <div className="dl-guest-bars" dir="ltr">{trend.map(item => <button type="button" key={item.day} className={day === item.day ? "is-selected" : ""} aria-pressed={day === item.day} aria-label={`${guestDate(item.day)}: ${guestNumber(item.count)} جلسات`} title={`${guestDate(item.day)}: ${guestNumber(item.count)} جلسات`} onClick={() => { setDay(day === item.day ? null : item.day); setPage(1); }}><span className="dl-guest-bar-number">{guestNumber(item.count)}</span><span className="dl-guest-bar-track"><i style={{ height: `${Math.max(3, item.count / max * 100)}%`, opacity: item.count ? 1 : 0.2 }} /></span><small>{guestNumber(Number(item.day.slice(8)))}</small></button>)}</div>
        <span className="dl-guest-chart-note">التواريخ بتوقيت UTC</span>
      </section>
      <section className="dl-access-glass dl-guest-chart" aria-labelledby="guest-status-heading">
        <h3 id="guest-status-heading">حالة جلسات الدخول</h3><p>الحالة تعبر عن صلاحية الجلسة، ولا تعني وجود المتدرب الآن.</p>
        <div className="dl-guest-status-chart">
          <div className="dl-guest-donut" role="img" aria-label={`إجمالي ${guestNumber(summary.sessions)} جلسات، ${statuses.map(item => `${guestNumber(summary[item])} ${guestStatusLabels[item]}`).join("، ")}`} style={{ background: summary.sessions ? `conic-gradient(var(--guest-active) 0% ${activeEnd}%, var(--guest-expired) ${activeEnd}% ${expiredEnd}%, var(--guest-revoked) ${expiredEnd}% 100%)` : "var(--color-border)" }}><div><strong>{guestNumber(summary.sessions)}</strong><span>جلسة دخول</span></div></div>
          <div className="dl-guest-legend">{statuses.map(item => <button key={item} type="button" aria-pressed={status === item} onClick={() => chooseStatus(status === item ? "all" : item)}><i className={`dl-guest-dot dl-guest-dot-${item}`} /><span>{guestStatusLabels[item]}</span><b>{guestNumber(summary[item])}</b></button>)}</div>
        </div>
      </section>
    </div>

    <div className="dl-access-glass dl-guest-table-panel">
      <div className="dl-guest-table-toolbar">
        <div className="dl-guest-status-tabs" role="group" aria-label="تصفية حسب حالة الجلسة">{(["all", ...statuses] as const).map(item => <button type="button" key={item} aria-pressed={status === item} onClick={() => chooseStatus(item)}>{item === "all" ? "الكل" : guestStatusLabels[item]}</button>)}</div>
        <label>الترتيب<select aria-label="الترتيب" value={sort} onChange={event => { setSort(event.target.value as GuestSort); setPage(1); }}><option value="lastSeen">آخر نشاط</option><option value="name">الاسم</option><option value="progress">إنجاز المحاضرات</option><option value="quizzes">الاختبارات المكتملة</option><option value="score">متوسط الدرجة</option></select></label>
      </div>
      {day && <div className="dl-guest-day-filter">جلسات {guestDate(day)} <button type="button" className="btn btn-secondary" onClick={() => { setDay(null); setPage(1); }}>إلغاء تصفية اليوم</button></div>}
      <div className="dl-guest-table-scroll" role="region" aria-label="جدول المتدربين الزوار" tabIndex={0}>
        <table className="dl-guest-table"><caption className="sr-only">جلسات الزوار وإنجاز المحاضرات ومحاولات الاختبار. متوسط الدرجة بالنقاط، وليس نسبة مئوية.</caption><thead><tr><th scope="col">المتدرب</th><th scope="col">الحالة</th><th scope="col">إنجاز المحاضرات</th><th scope="col">محاولات الاختبار<small>مكتملة / بدأت</small></th><th scope="col">متوسط الدرجة<small>نقاط</small></th><th scope="col">آخر نشاط<small>UTC</small></th></tr></thead>
          <tbody>{visible.map(row => <tr key={row.guestSessionId}>
            <td><div className="dl-guest-person"><span className="dl-guest-avatar" aria-hidden="true">{row.displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span><details><summary>{row.displayName}</summary><small>الانضمام: {guestDate(row.joinedAt, true)}</small></details></div></td>
            <td><span className={`dl-guest-badge dl-guest-badge-${row.status}`}><i />{guestStatusLabels[row.status]}</span></td>
            <td><div className="dl-guest-progress-copy"><bdi dir="ltr">{guestNumber(row.lecturesCompleted)} / {guestNumber(row.totalLectures)}</bdi><small>{guestNumber(lectureProgress(row))}٪</small></div><progress max={100} value={lectureProgress(row)} aria-label={`إنجاز محاضرات ${row.displayName}`} /></td>
            <td><bdi dir="ltr">{guestNumber(row.quizzesCompleted)} / {guestNumber(row.quizzesStarted)}</bdi></td>
            <td>{row.averageScore === null ? <span title="لا توجد محاولات مصححة">—</span> : guestNumber(row.averageScore)}</td>
            <td><time dateTime={row.lastSeenAt}>{guestDate(row.lastSeenAt, true)}</time></td>
          </tr>)}</tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="dl-guest-empty"><PlatformIcon name="users" /><h3>{rows.length ? "لا توجد جلسات تطابق التصفية" : "لم ينضم زوار بعد"}</h3><p>{rows.length ? "غيّر البحث أو الحالة أو الفترة لعرض سجلات أخرى." : "ستظهر الإحصاءات عند دخول المتدربين عبر الرابط المنشور."}</p></div>}
      <div className="dl-guest-pagination"><span role="status">{guestNumber(filtered.length)} جلسة · صفحة {guestNumber(currentPage)} من {guestNumber(pages)}</span><label>عدد الصفوف<select aria-label="عدد الصفوف" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>١٠</option><option value={20}>٢٠</option><option value={50}>٥٠</option></select></label><div><button type="button" className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>السابق</button><button type="button" className="btn btn-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>التالي</button></div></div>
    </div>
  </section>;
}
