import Link from "next/link";
import type { Assignment, GuestTrainingSession, Lecture, LearnerAnalytics, PaginatedResult, Subject, UserProfile } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { LearnerAnalyticsSection } from "@/components/analytics/LearnerAnalyticsSection";
import { themeForSubject, subjectIconByTheme } from "@/lib/content/subjectTheme";

export const metadata = { title: "الرئيسية | القيادة الرقمية" };

export default async function DashboardPage() {
  let profile: UserProfile | null = null;
  let guestSession: GuestTrainingSession | null = null;
  let subjectsResult: PaginatedResult<Subject> | null = null;
  let errorMessage: string | null = null;

  try {
    subjectsResult = await apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=6");
    try {
      profile = (await apiGet<UserProfile>("/api/v1/me")).data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        guestSession = (await apiGet<GuestTrainingSession>("/api/v1/guest/me")).data;
      } else throw err;
    }
  } catch (err) {
    errorMessage = toSafeErrorMessage(err, "your dashboard").message;
  }

  let analytics: LearnerAnalytics | null = null;
  let analyticsErrorMessage: string | null = null;
  if (!errorMessage && !guestSession) {
    try {
      analytics = (await apiGet<LearnerAnalytics>("/api/v1/analytics/me")).data;
    } catch (err) {
      analyticsErrorMessage = toSafeErrorMessage(err, "your learning analytics").message;
    }
  }

  // Lower dashboard: "آخر المحاضرات المضافة" / "أحدث الأنشطة". There is
  // no cross-subject, efficient "all lectures"/"all assignments" API
  // (contentRoutes.ts only exposes `/subjects/:subjectId/lectures` and
  // `/subjects/:subjectId/assignments`, scoped to one subject) — so this
  // merges each visible subject's own first page of real lectures/
  // assignments and sorts by `createdAt`, rather than inventing any data
  // or a platform-wide endpoint that doesn't exist. Capped to the first
  // 5 subjects already on the page to bound the number of requests.
  // "الأنشطة القادمة" (upcoming) was NOT used as a heading — `Assignment`
  // has no due-date field anywhere in the schema, so there is no real
  // "upcoming" concept to report; "أحدث الأنشطة" (latest activity)
  // reflects what the data actually is: recently published assignments.
  let recentLectures: (Lecture & { subjectTitle: string })[] = [];
  let recentAssignments: (Assignment & { subjectTitle: string })[] = [];
  if (!errorMessage && subjectsResult) {
    const subjectsForAggregation = subjectsResult.data.slice(0, 5);
    try {
      const [lectureLists, assignmentLists] = await Promise.all([
        Promise.all(
          subjectsForAggregation.map((s) =>
            apiGetPaginated<Lecture>(`/api/v1/subjects/${s.id}/lectures?page=1&limit=5`)
              .then((r) => r.data.map((l) => ({ ...l, subjectTitle: s.title })))
              .catch(() => []),
          ),
        ),
        Promise.all(
          subjectsForAggregation.map((s) =>
            apiGetPaginated<Assignment>(`/api/v1/subjects/${s.id}/assignments?page=1&limit=5`)
              .then((r) => r.data.map((a) => ({ ...a, subjectTitle: s.title })))
              .catch(() => []),
          ),
        ),
      ]);
      recentLectures = lectureLists
        .flat()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4);
      recentAssignments = assignmentLists
        .flat()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4);
    } catch {
      // Best-effort aggregation only — a failure here must never break
      // the rest of the dashboard, which already rendered successfully.
    }
  }

  const welcomeName = profile?.displayName ?? guestSession?.displayName;

  return (
    <section className="dl-dashboard" dir="rtl">
      <div className="dl-hero">
        <div className="dl-hero-copy">
          <span className="dl-welcome">{welcomeName ? `مرحباً، ${welcomeName}` : "مرحباً بك"}</span>
          <h1>منصة القيادة الرقمية</h1>
          <h2>التعلم ... نحو مستقبل رقمي أفضل</h2>
          <p>منصة تعليمية تفاعلية حديثة لعرض محتوى الدبلوم، المحاضرات والاختبارات بأسلوب واضح ومرن يدعم بناء قدرات القادة.</p>
          <div className="dl-hero-dots" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <div className="dl-hero-mark" aria-hidden="true">
          <img src="/logo.webp" alt="" />
        </div>
        <div className="dl-hero-tech" aria-hidden="true">
          <svg className="dl-hero-tech-art" viewBox="0 0 560 330" role="presentation">
            <defs>
              <linearGradient id="screenGlow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0a2630" />
                <stop offset=".55" stopColor="#0b5360" />
                <stop offset="1" stopColor="#041f29" />
              </linearGradient>
              <radialGradient id="netGlow">
                <stop offset="0" stopColor="#24d9ef" stopOpacity=".9" />
                <stop offset="1" stopColor="#24d9ef" stopOpacity="0" />
              </radialGradient>
              <filter id="softGlow"><feGaussianBlur stdDeviation="5" /></filter>
            </defs>
            <ellipse cx="350" cy="292" rx="190" ry="24" fill="#021a22" opacity=".62" />
            <path d="M165 82h250l-18 157H184z" fill="url(#screenGlow)" stroke="#4bc8d1" strokeOpacity=".34" strokeWidth="3" />
            <path d="M184 239h213l98 45H100z" fill="#0a2229" stroke="#62858b" strokeOpacity=".45" strokeWidth="2" />
            <path d="M141 270h315l39 14H100z" fill="#153139" opacity=".95" />
            <path d="M188 245h203l54 24H139z" fill="#173a42" />
            <g fill="none" stroke="#27d7ed" strokeOpacity=".58" strokeWidth="1.8">
              <path d="M235 226Q320 150 430 221" />
              <path d="M215 248Q315 172 462 236" />
              <path d="M262 258Q330 195 475 252" />
              <path d="M278 215L332 178 389 205 444 169" />
            </g>
            <g fill="#ffd052">
              <circle cx="235" cy="226" r="4"/><circle cx="332" cy="178" r="5"/><circle cx="389" cy="205" r="4"/><circle cx="444" cy="169" r="4"/><circle cx="462" cy="236" r="4"/>
            </g>
            <g fill="#29d9ef" opacity=".65">
              <circle cx="235" cy="226" r="20" fill="url(#netGlow)" filter="url(#softGlow)"/>
              <circle cx="389" cy="205" r="24" fill="url(#netGlow)" filter="url(#softGlow)"/>
              <circle cx="462" cy="236" r="20" fill="url(#netGlow)" filter="url(#softGlow)"/>
            </g>
            <g className="dl-tech-tile" fill="#0b5260" fillOpacity=".45" stroke="#55d6df" strokeOpacity=".5">
              <rect x="224" y="72" width="66" height="66" rx="9"/><rect x="307" y="42" width="66" height="66" rx="9"/>
              <rect x="389" y="82" width="66" height="66" rx="9"/><rect x="300" y="128" width="66" height="66" rx="9"/>
            </g>
            <g fill="none" stroke="#d7f7f7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".82">
              <path d="M243 116v-20h28v20M250 116v-12M264 116v-12"/>
              <path d="M326 84h29M331 75v9M340 66v18M349 58v26"/>
              <path d="M406 111h31M412 104c3-12 17-12 20 0M421 94v17"/>
              <circle cx="333" cy="155" r="10"/><path d="M326 163l-7 13M340 163l7 13M323 176h28"/>
            </g>
          </svg>
        </div>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} retryHref="/dashboard" /> : null}

      {!errorMessage && subjectsResult ? (
        <div className="dl-subject-section">
          <div className="dl-section-heading">
            <div>
              <span>المحتوى الدراسي</span>
              <h2>المواد الدراسية</h2>
            </div>
            <Link href="/subjects">عرض جميع المواد ←</Link>
          </div>
          {subjectsResult.data.length === 0 ? (
            <EmptyState title="لا توجد مواد متاحة حالياً" message="ستظهر المواد هنا فور نشرها." />
          ) : (
            <div className="dl-subject-grid">
              {subjectsResult.data.map((subject, index) => {
                const theme = themeForSubject(subject, index);
                const subjectAnalytics = analytics?.subjects.find((s) => s.subjectId === subject.id);
                return (
                  <Link key={subject.id} href={`/subjects/${subject.id}`} className={`dl-subject-card dl-theme-${theme}`}>
                    <div className="dl-subject-icon" aria-hidden="true">{subjectIconByTheme[theme]}</div>
                    <h3>{subject.title}</h3>
                    {subject.description ? <p>{subject.description}</p> : <p>استعرض المحاضرات والمحتوى والاختبارات الخاصة بالمادة.</p>}
                    {/* Real lecture count only — never fabricated. Only
                     * available for a registered learner (`analytics` is
                     * null for guests, since `/analytics/me` requires a
                     * user id); a guest simply sees no count, per the
                     * "don't invent metadata" rule. */}
                    {subjectAnalytics ? (
                      <span className="dl-subject-meta">{subjectAnalytics.totalLectures} محاضرة</span>
                    ) : null}
                    <span className="dl-subject-button">عرض المادة <b>←</b></span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {!errorMessage && (recentLectures.length > 0 || recentAssignments.length > 0) ? (
        <div className="dl-lower-grid">
          {recentLectures.length > 0 ? (
            <div className="dl-lower-card">
              <div className="dl-section-heading">
                <div><span>محتوى جديد</span><h2>آخر المحاضرات المضافة</h2></div>
              </div>
              <ul className="dl-lower-list">
                {recentLectures.map((lecture) => (
                  <li key={lecture.id}>
                    <Link href={`/subjects/${lecture.subjectId}/lectures/${lecture.id}`}>
                      <b>{lecture.title}</b>
                      <small>{lecture.subjectTitle}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {recentAssignments.length > 0 ? (
            <div className="dl-lower-card">
              <div className="dl-section-heading">
                <div><span>تدريب عملي</span><h2>أحدث الأنشطة</h2></div>
              </div>
              <ul className="dl-lower-list">
                {recentAssignments.map((assignment) => (
                  <li key={assignment.id}>
                    <Link href={`/subjects/${assignment.subjectId}/assignments/${assignment.id}`}>
                      <b>{assignment.title}</b>
                      <small>{assignment.subjectTitle}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {analytics ? (
        <div className="dl-analytics-panel">
          <div className="dl-section-heading"><div><span>متابعة التعلم</span><h2>تقدمك الدراسي</h2></div></div>
          <LearnerAnalyticsSection analytics={analytics} />
        </div>
      ) : analyticsErrorMessage ? (
        <ErrorState message={analyticsErrorMessage} retryHref="/dashboard" />
      ) : null}
    </section>
  );
}
