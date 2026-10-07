import Link from "next/link";
import type { GuestTrainingSession, LearnerAnalytics, PaginatedResult, Subject, UserProfile } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { PersonalAnalytics } from "@/components/learning/PersonalAnalytics";
import { LearnerAnalyticsSection } from "@/components/analytics/LearnerAnalyticsSection";
import { ReferenceArtwork } from "@/components/ui/ReferenceArtwork";
import { DashboardSubjectCard } from "@/components/content/DashboardSubjectCard";
import { DashboardPanels } from "@/components/content/DashboardPanels";
import { getSubjectTheme, subjectThemes } from "@/components/content/subjectTheme";
import { getDashboardContent } from "@/lib/dashboardContent";

export const metadata = { title: "الرئيسية | القيادة الرقمية" };

export default async function DashboardPage() {
  let profile: UserProfile | null = null;
  let guestSession: GuestTrainingSession | null = null;
  let subjectsResult: PaginatedResult<Subject> | null = null;
  let errorMessage: string | null = null;

  try {
    subjectsResult = await apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=5");
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
  let analyticsError: string | null = null;
  if (!errorMessage && profile && !guestSession) {
    try { analytics = (await apiGet<LearnerAnalytics>("/api/v1/analytics/me")).data; }
    catch { analyticsError = "تعذر تحميل تفاصيل الأداء. حاول مرة أخرى."; }
  }
  const welcomeName = profile?.displayName ?? guestSession?.displayName;
  const subjects = [...(subjectsResult?.data ?? [])].sort((a, b) => subjectThemes.indexOf(getSubjectTheme(a.title)) - subjectThemes.indexOf(getSubjectTheme(b.title)) || a.orderIndex - b.orderIndex);
  const content = !errorMessage ? await getDashboardContent(subjects) : null;

  return (
    <section className="dl-dashboard" dir="rtl">
      <div className="dl-hero">
        <ReferenceArtwork x={203} y={97} width={1065} height={246} className="dl-hero-artwork" eager />
        <div className="dl-hero-copy">
          <span className="sr-only">{welcomeName ? `مرحباً، ${welcomeName}` : "مرحباً بك"}</span>
          <h1>منصة القيادة الرقمية</h1>
          <h2>التعلم ... نحو مستقبل رقمي أفضل</h2>
          <p>منصة تعليمية تفاعلية تقدم محتوى دبلوم القيادة الرقمية<br />بأسلوب تفاعلي حديث ومرن، لدعم بناء قدرات القادة.</p>
          <div className="dl-hero-dots" aria-hidden="true"><i /><i /><i /></div>
        </div>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} retryHref="/dashboard" /> : null}
      {!errorMessage ? <PersonalAnalytics /> : null}

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
              {subjects.map((subject, index) => <DashboardSubjectCard key={subject.id} subject={subject} index={index} lectureCount={content?.lectureCounts[subject.id] ?? null} />)}
            </div>
          )}
        </div>
      ) : null}

      {content ? <DashboardPanels content={content} /> : null}
      {analytics || analyticsError ? <details className="dl-detailed-analytics"><summary>تفاصيل أداء الاختبارات والتقدم حسب المادة</summary>{analytics ? <LearnerAnalyticsSection analytics={analytics} /> : <ErrorState message={analyticsError!} retryHref="/dashboard" />}</details> : null}
    </section>
  );
}
