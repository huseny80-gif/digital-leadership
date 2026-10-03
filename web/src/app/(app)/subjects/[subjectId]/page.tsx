import type { Assignment, Lecture, Quiz, Subject, SubjectProgress } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { LectureCard } from "@/components/content/LectureCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * Subject detail (API_V1.md `GET /subjects/:subjectId`,
 * `GET /subjects/:subjectId/lectures`). A subject that is real but not
 * visible to this caller (unpublished, non-admin) returns the identical
 * `404` a nonexistent one would (API_SECURITY.md §3) — this page renders
 * the same `NotFoundState` for both, never trying to distinguish them.
 */
export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

  let subject: Subject | null = null;
  let lectures: Lecture[] = [];
  let assignments: Assignment[] = [];
  let quizzes: Quiz[] = [];
  let progress: SubjectProgress | null = null;
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [subjectRes, lecturesRes, assignmentsRes, quizzesRes] = await Promise.all([
      apiGet<Subject>(`/api/v1/subjects/${subjectId}`),
      apiGetPaginated<Lecture>(`/api/v1/subjects/${subjectId}/lectures?page=1&limit=50`),
      apiGetPaginated<Assignment>(`/api/v1/subjects/${subjectId}/assignments?page=1&limit=50`),
      apiGet<Quiz[]>(`/api/v1/subjects/${subjectId}/assessments`),
    ]);
    subject = subjectRes.data;
    lectures = lecturesRes.data;
    assignments = assignmentsRes.data;
    quizzes = quizzesRes.data;

    // Best-effort — never gates this page's visibility, already handled
    // above. If it fails, the progress bar is simply omitted.
    try {
      const progressRes = await apiGet<SubjectProgress>(`/api/v1/subjects/${subjectId}/progress`);
      progress = progressRes.data;
    } catch {
      // keep progress null
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this subject").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}`} />;
  }

  return (
    <section>
      <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: subject!.title }]} />

      <div className="subject-hero">
        <h1 className="subject-hero-title">{subject!.title}</h1>
        {subject!.description ? (
          <p className="subject-hero-description">{subject!.description}</p>
        ) : null}
        <div className="subject-hero-chips">
          <span className="subject-hero-chip">
            المحاضرات <b>{lectures.length}</b>
          </span>
          <span className="subject-hero-chip">
            التكليفات <b>{assignments.length}</b>
          </span>
          <span className="subject-hero-chip">
            الاختبارات <b>{quizzes.length}</b>
          </span>
        </div>
        {progress && progress.totalLectures > 0 ? (
          <ProgressBar
            label="تقدمك في المادة"
            percentage={(progress.completedLectures / progress.totalLectures) * 100}
            valueLabel={`${progress.completedLectures} من ${progress.totalLectures} محاضرة مكتملة`}
          />
        ) : null}
      </div>

      <div className="fq-section-label"><span>مساحة المادة</span><strong>تصفح المحتوى التعليمي</strong></div>

      <SubjectTabs
        tabs={subjectTabs(subjectId, {
          lectures: lectures.length,
          assignments: assignments.length,
          assessments: quizzes.length,
        })}
      />

      <div className="fq-content-heading"><div><span className="fq-content-icon">📖</span><div><small>المحتوى المنشور</small><h2>المحاضرات</h2></div></div><span>{lectures.length} محاضرة</span></div>

      {lectures.length === 0 ? (
        <EmptyState title="لا توجد محاضرات بعد" message="ستظهر محاضرات هذه المادة هنا فور نشرها." />
      ) : (
        <div className="item-list">
          {lectures.map((lecture) => (
            <LectureCard key={lecture.id} subjectId={subjectId} lecture={lecture} />
          ))}
        </div>
      )}
    </section>
  );
}

