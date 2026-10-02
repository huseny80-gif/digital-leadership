import Link from "next/link";
import type { GuestTrainingSession, LearnerAnalytics, PaginatedResult, Subject, UserProfile } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { LearnerAnalyticsSection } from "@/components/analytics/LearnerAnalyticsSection";

export const metadata = { title: "الرئيسية | القيادة الرقمية" };

const subjectThemes = ["ai", "legal", "cyber", "innovation", "risk"] as const;
const subjectIcons = ["◉", "⚖", "⬡", "✦", "△"];

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
              {subjectsResult.data.map((subject, index) => (
                <Link key={subject.id} href={`/subjects/${subject.id}`} className={`dl-subject-card dl-theme-${subjectThemes[index % subjectThemes.length]}`}>
                  <div className="dl-subject-icon" aria-hidden="true">{subjectIcons[index % subjectIcons.length]}</div>
                  <h3>{subject.title}</h3>
                  {subject.description ? <p>{subject.description}</p> : <p>استعرض المحاضرات والمحتوى والاختبارات الخاصة بالمادة.</p>}
                  <span className="dl-subject-button">عرض المادة <b>←</b></span>
                </Link>
              ))}
            </div>
          )}
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
