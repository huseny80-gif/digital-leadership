import type { Assignment, Lecture, Quiz, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { AssignmentCard } from "@/components/content/AssignmentCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";

/**
 * Assignments list for a subject (`GET /api/v1/subjects/:subjectId/assignments`
 * — PHASE 12P). Same visibility rule as every other content listing: a
 * draft subject, or one this caller cannot see, 404s — never a
 * distinguishing 403 (SECURITY_ARCHITECTURE.md §13). Assignments are
 * 100% subject-scoped (`lectureId` is always `null` for the migrated
 * Finquiz data) — this page never reads or depends on `lectureId`.
 */
export default async function SubjectAssignmentsPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

  let subject: Subject | null = null;
  let assignments: Assignment[] = [];
  let lectures: Lecture[] = [];
  let quizzes: Quiz[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [subjectRes, assignmentsRes, lecturesRes, quizzesRes] = await Promise.all([
      apiGet<Subject>(`/api/v1/subjects/${subjectId}`),
      apiGetPaginated<Assignment>(`/api/v1/subjects/${subjectId}/assignments?page=1&limit=50`),
      apiGetPaginated<Lecture>(`/api/v1/subjects/${subjectId}/lectures?page=1&limit=50`),
      apiGet<Quiz[]>(`/api/v1/subjects/${subjectId}/assessments`),
    ]);
    subject = subjectRes.data;
    assignments = assignmentsRes.data;
    lectures = lecturesRes.data;
    quizzes = quizzesRes.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "assignments").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}/assignments`} />;
  }

  return (
    <section>
      <Breadcrumbs
        items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: subject!.title, href: `/subjects/${subjectId}` }, { label: "التكليفات" }]}
      />
      <div className="subject-hero">
        <h1 className="subject-hero-title">{subject!.title}</h1>
        <p className="subject-hero-description">التكليفات والأنشطة التعليمية المتاحة ضمن مادة {subject!.title}.</p>
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

      <div className="fq-content-heading"><div><span className="fq-content-icon">📋</span><div><small>أنشطة المادة</small><h2>التكليفات</h2></div></div><span>{assignments.length} تكليف</span></div>\n\n      {assignments.length === 0 ? (
        <EmptyState title="لا توجد تكليفات بعد" message="ستظهر تكليفات هذه المادة هنا فور نشرها." />
      ) : (
        <div className="item-list">
          {assignments.map((assignment) => (
            <AssignmentCard key={assignment.id} subjectId={subjectId} assignment={assignment} />
          ))}
        </div>
      )}
    </section>
  );
}

