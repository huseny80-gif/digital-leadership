import Link from "next/link";
import type { Assignment, GuestTrainingSession, Lecture, LearnerAnalytics, PaginatedResult, Subject, UserProfile } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { LearnerAnalyticsSection } from "@/components/analytics/LearnerAnalyticsSection";
import { themeForSubject, subjectIconByTheme } from "@/lib/content/subjectTheme";
import { ChevronIcon } from "@/components/layout/Icons";

// Arabic-locale date formatting for the real `createdAt` timestamp shown
// in the lower dashboard lists — never a fabricated/placeholder date.
const lowerListDateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});
function formatLowerListDate(iso: string): string {
  return lowerListDateFormatter.format(new Date(iso)).replaceAll("-", "/");
}

export const metadata = { title: "الرئيسية | القيادة الرقمية" };

export default async function DashboardPage() {
  let profile: UserProfile | null = null;
  let subjectsResult: PaginatedResult<Subject> | null = null;
  let errorMessage: string | null = null;

  try {
    subjectsResult = await apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=6");
    try {
      profile = (await apiGet<UserProfile>("/api/v1/me")).data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await apiGet<GuestTrainingSession>("/api/v1/guest/me");
      } else throw err;
    }
  } catch (err) {
    errorMessage = toSafeErrorMessage(err, "your dashboard").message;
  }

  let analytics: LearnerAnalytics | null = null;
  let analyticsErrorMessage: string | null = null;
  if (!errorMessage && profile) {
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

  const themeOrder = { ai: 0, legal: 1, cyber: 2, innovation: 3, risk: 4 } as const;
  const orderedSubjects = subjectsResult
    ? [...subjectsResult.data].sort((a, b) => {
        const aTheme = themeForSubject(a, 99);
        const bTheme = themeForSubject(b, 99);
        return themeOrder[aTheme] - themeOrder[bTheme];
      })
    : [];

  return (
    <section className="dl-dashboard" dir="rtl">
      <div className="dl-hero">
        <div className="dl-hero-copy">
          <h1>منصة القيادة الرقمية</h1>
          <h2>التعلم ... نحو مستقبل رقمي أفضل</h2>
          <p>منصة تعليمية تفاعلية حديثة تقدم محتوى ديبلوم القيادة الرقمية بأسلوب تفاعلي حديث ومرن لدعم بناء قدرات القادة.</p>
          <div className="dl-hero-dots" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <div className="dl-hero-mark" aria-hidden="true">
          <img src="/logo.webp" alt="" />
        </div>
        <div className="dl-hero-tech" aria-hidden="true">
          <img
            className="dl-hero-tech-art"
            src="/hero-tech-right.webp"
            alt=""
            loading="eager"
          />
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
          {orderedSubjects.length === 0 ? (
            <EmptyState title="لا توجد مواد متاحة حالياً" message="ستظهر المواد هنا فور نشرها." />
          ) : (
            <div className="dl-subject-grid">
              {orderedSubjects.map((subject, index) => {
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
                <Link href="/subjects">عرض الكل ←</Link>
              </div>
              <ul className="dl-lower-list">
                {recentLectures.map((lecture) => (
                  <li key={lecture.id}>
                    <Link href={`/subjects/${lecture.subjectId}/lectures/${lecture.id}`}>
                      <span className="dl-lower-item-copy">
                        <b>{lecture.title}</b>
                        <small>{lecture.subjectTitle}</small>
                      </span>
                      <span className="dl-lower-item-date">{formatLowerListDate(lecture.createdAt)}</span>
                      <ChevronIcon className="dl-lower-item-chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {recentAssignments.length > 0 ? (
            <div className="dl-lower-card">
              <div className="dl-section-heading">
                {/* The reference image labels this "الأنشطة القادمة"
                 * (upcoming), but `Assignment` still has no due-date
                 * field anywhere in the schema — there is no real
                 * "upcoming" concept to report, only recently-created
                 * assignments. Keeping the honest label rather than
                 * matching the reference's wording verbatim. */}
                <div><span>تدريب عملي</span><h2>أحدث الأنشطة</h2></div>
                <Link href="/subjects">عرض الكل ←</Link>
              </div>
              <ul className="dl-lower-list">
                {recentAssignments.map((assignment) => (
                  <li key={assignment.id}>
                    <Link href={`/subjects/${assignment.subjectId}/assignments/${assignment.id}`}>
                      <span className="dl-lower-item-copy">
                        <b>{assignment.title}</b>
                        <small>{assignment.subjectTitle}</small>
                      </span>
                      <span className="dl-lower-item-date">{formatLowerListDate(assignment.createdAt)}</span>
                      <ChevronIcon className="dl-lower-item-chevron" />
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
