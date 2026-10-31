import type { Subject } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { studyModulesForSubject } from "@/components/content/studyModules";
import { SubjectSummaries } from "@/components/content/SubjectSummaries";
import { ErrorState, NotFoundState } from "@/components/ui/States";

export default async function SubjectSummariesPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = await params;
  if (!studyModulesForSubject(subjectId)) return <NotFoundState message="ملخصات هذه المادة غير متاحة." />;
  let subject: Subject;
  try {
    subject = (await apiGet<Subject>(`/api/v1/subjects/${subjectId}`)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundState message="المادة غير متاحة." />;
    return <ErrorState message="تعذر تحميل هذه المادة. أعد المحاولة." retryHref={`/subjects/${subjectId}/summaries`} />;
  }
  if (subject.id !== subjectId) return <NotFoundState message="المادة غير متاحة." />;
  return <section>
    <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: subject.title, href: `/subjects/${subjectId}` }, { label: "الملخصات والبودكاست" }]} />
    <h1 className="page-heading">الملخصات والبودكاست</h1>
    <p className="page-subheading">{subject.title}</p>
    <SubjectTabs tabs={subjectTabs(subjectId)} activeKey="summaries" />
    <SubjectSummaries key={subjectId} subjectId={subjectId} subjectTitle={subject.title} />
  </section>;
}
