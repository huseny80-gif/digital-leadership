import type { ExamMaterialDetail, ExamMaterialIndex } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { ExamMaterialWorkspace } from "@/components/exam-material/ExamMaterialWorkspace";

export default async function ExamMaterialPage({ params, searchParams }: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ group?: string; tab?: string; attempt?: string }>;
}) {
  const { subjectId } = await params;
  const query = await searchParams;
  let index: ExamMaterialIndex, detail: ExamMaterialDetail | null = null;
  try {
    index = (await apiGet<ExamMaterialIndex>(`/api/v1/subjects/${subjectId}/exam-material`)).data;
    const groupId = query.group ?? index.groups[0]?.id;
    if (groupId) detail = (await apiGet<ExamMaterialDetail>(`/api/v1/subjects/${subjectId}/exam-material/${encodeURIComponent(groupId)}`)).data;
  } catch (error) {
    if (error instanceof ApiError && [400, 404].includes(error.status)) return <NotFoundState message="المادة الامتحانية غير متاحة." />;
    return <ErrorState message="تعذر تحميل المادة الامتحانية. حاول مرة أخرى." retryHref={`/subjects/${subjectId}/exam-material`} />;
  }
  return <section dir="rtl">
    <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: index.subject.title, href: `/subjects/${subjectId}` }, { label: "المادة الامتحانية" }]} />
    <h1 className="page-heading">المادة الامتحانية</h1>
    <p className="page-subheading">{index.subject.title}</p>
    <SubjectTabs tabs={subjectTabs(subjectId)} activeKey="exam-material" />
    <ExamMaterialWorkspace key={subjectId} initialIndex={index} initialDetail={detail} />
  </section>;
}
