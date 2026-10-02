import type { Assignment, Lecture, Quiz, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { QuizCard } from "@/components/quiz/QuizCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";

/**
 * Assessments list for a subject (`GET /api/v1/subjects/:subjectId/assessments`
 * — ASSESSMENT_API.md). Same visibility rule as every other content
 * listing: a draft subject, or one this caller cannot see, 404s — never a
 * distinguishing 403 (SECURITY_ARCHITECTURE.md §13).
 */
export default async function SubjectAssessmentsPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

  let subject: Subject | null = null;
  let quizzes: Quiz[] = [];
  let lectures: Lecture[] = [];
  let assignments: Assignment[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [subjectRes, quizzesRes, lecturesRes, assignmentsRes] = await Promise.all([
      apiGet<Subject>(`/api/v1/subjects/${subjectId}`),
      apiGet<Quiz[]>(`/api/v1/subjects/${subjectId}/assessments`),
      apiGetPaginated<Lecture>(`/api/v1/subjects/${subjectId}/lectures?page=1&limit=50`),
      apiGetPaginated<Assignment>(`/api/v1/subjects/${subjectId}/assignments?page=1&limit=50`),
    ]);
    subject = subjectRes.data;
    quizzes = quizzesRes.data;
    lectures = lecturesRes.data;
    assignments = assignmentsRes.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "assessments").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}/assessments`} />;
  }

  return (
    <section>
      <Breadcrumbs
        items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: subject!.title, href: `/subjects/${subjectId}` }, { label: "الاختبارات" }]}
      />
      <div className="subject-hero">
        <h1 className="subject-hero-title">{subject!.title}</h1>
        <p className="subject-hero-description">اختبارات تفاعلية متاحة ضمن مادة {subject!.title}.</p>
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
      </div>

      <div className="fq-section-label"><span>مساحة المادة</span><strong>تصفح المحتوى التعليمي</strong></div>\n\n      <SubjectTabs
        tabs={subjectTabs(subjectId, {
          lectures: lectures.length,
          assignments: assignments.length,
          assessments: quizzes.length,
        })}
      />

      <div className="fq-content-heading"><div><span className="fq-content-icon">❓</span><div><small>اختبر معرفتك</small><h2>الاختبارات</h2></div></div><span>{quizzes.length} اختبار</span></div>\n\n      {quizzes.length === 0 ? (
        <EmptyState title="لا توجد اختبارات بعد" message="ستظهر اختبارات هذه المادة هنا فور نشرها." />
      ) : (
        <div className="item-list">
          {quizzes.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </div>
      )}
    </section>
  );
}

