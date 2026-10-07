import Link from "next/link";
import type { Assignment, AssignmentProgress, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { AssignmentCompleteToggle } from "@/components/learning/AssignmentCompleteToggle";

/** Published assignment details with private learner completion and trainer-defined reminders. */
export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ subjectId: string; assignmentId: string }>;
}) {
  const { subjectId, assignmentId } = await params;

  let subject: Subject | null = null;
  let assignments: Assignment[] = [];
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [subjectRes, assignmentsRes] = await Promise.all([
      apiGet<Subject>(`/api/v1/subjects/${subjectId}`),
      apiGetPaginated<Assignment>(`/api/v1/subjects/${subjectId}/assignments?page=1&limit=50`),
    ]);
    subject = subjectRes.data;
    assignments = assignmentsRes.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this assignment").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This subject doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}/assignments/${assignmentId}`} />;
  }

  const currentIndex = assignments.findIndex((a) => a.id === assignmentId);
  const assignment = currentIndex !== -1 ? assignments[currentIndex] : null;

  if (!assignment) {
    return <NotFoundState message="This assignment doesn't exist or is not available." />;
  }

  const previousAssignment = currentIndex > 0 ? assignments[currentIndex - 1] : null;
  const nextAssignment = currentIndex < assignments.length - 1 ? assignments[currentIndex + 1] : null;
  let progress: AssignmentProgress | null = null;
  let progressError = false;
  if (assignment.status === "published" && subject?.status === "published") {
    try { progress = (await apiGet<AssignmentProgress>(`/api/v1/learning/assignments/${assignmentId}/progress`)).data; }
    catch { progressError = true; }
  }

  return (
    <section className="dl-assignment-detail" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "المواد الدراسية", href: "/subjects" },
          { label: subject!.title, href: `/subjects/${subjectId}` },
          { label: "الواجبات", href: `/subjects/${subjectId}/assignments` },
          { label: assignment.title },
        ]}
      />

      <h1 className="page-heading">{assignment.title}</h1>
      <p className="item-row-meta" style={{ marginBottom: "var(--space-2)" }}>
        {subject!.title} · الواجب {currentIndex + 1} من {assignments.length}
        {" · "}
        <span className="badge">{assignment.status === "published" ? "منشور" : "مسودة"}</span>
      </p>
      {assignment.description ? <p className="page-subheading">{assignment.description}</p> : null}
      {assignment.dueAt ? <p className="dl-detail-deadline">الموعد النهائي: <time dateTime={assignment.dueAt}>{new Intl.DateTimeFormat("ar",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(assignment.dueAt))} (UTC)</time></p> : null}

      <Link
        href={`/subjects/${subjectId}/assignments`}
        className="btn btn-secondary"
        style={{ marginBottom: "var(--space-5)", display: "inline-flex" }}
      >
        العودة إلى واجبات المادة
      </Link>

      {progress ? <div className="content-card"><h2 className="content-card-title">متابعة إنجاز الواجب</h2><AssignmentCompleteToggle assignmentId={assignmentId} initialCompleted={progress.completed} /></div> : progressError ? <p className="dl-learning-error" role="status">تعذر تحميل حالة الإنجاز. <a href={`/subjects/${subjectId}/assignments/${assignmentId}`}>إعادة المحاولة</a></p> : null}

      {previousAssignment || nextAssignment ? (
        <nav className="lecture-nav" aria-label="Assignment navigation">
          {previousAssignment ? (
            <Link
              href={`/subjects/${subjectId}/assignments/${previousAssignment.id}`}
              className="lecture-nav-link"
              data-direction="previous"
            >
              <span className="lecture-nav-label">← Previous</span>
              <span className="lecture-nav-title">{previousAssignment.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextAssignment ? (
            <Link
              href={`/subjects/${subjectId}/assignments/${nextAssignment.id}`}
              className="lecture-nav-link"
              data-direction="next"
            >
              <span className="lecture-nav-label">Next →</span>
              <span className="lecture-nav-title">{nextAssignment.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
