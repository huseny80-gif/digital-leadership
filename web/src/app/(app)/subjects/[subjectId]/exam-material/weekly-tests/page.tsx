import type { ExamMaterialIndex, WeeklyExamCollection, WeeklyExamPaper } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { ExamMaterialSections } from "@/components/exam-material/ExamMaterialSections";
import { WeeklyExams } from "@/components/exam-material/WeeklyExams";

export default async function WeeklyExamsPage({ params, searchParams }: {
  params: Promise<{ subjectId: string }>; searchParams: Promise<{ paper?: string }>;
}) {
  const { subjectId } = await params, query = await searchParams;
  let index: ExamMaterialIndex, collection: WeeklyExamCollection, paper: WeeklyExamPaper | null = null;
  try {
    const responses = await Promise.all([
      apiGet<ExamMaterialIndex>(`/api/v1/subjects/${subjectId}/exam-material`),
      apiGet<WeeklyExamCollection>(`/api/v1/subjects/${subjectId}/exam-material/weekly-tests`),
    ]);
    index = responses[0].data; collection = responses[1].data;
    const id = query.paper ?? collection.papers[0]!.id;
    if (collection.papers.some(paper => paper.id === id)) paper = (await apiGet<WeeklyExamPaper>(`/api/v1/subjects/${subjectId}/exam-material/weekly-tests/${id}`)).data;
  } catch (error) {
    if (error instanceof ApiError && [400, 404].includes(error.status)) return <NotFoundState message="الاختبارات الأسبوعية غير متاحة لهذه المادة." />;
    return <ErrorState message="تعذر تحميل الاختبارات الأسبوعية." retryHref={`/subjects/${subjectId}/exam-material/weekly-tests`} />;
  }
  if (!paper) return <NotFoundState message="الاختبار المطلوب غير متاح." />;
    return <section dir="rtl">
      <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: index.subject.title, href: `/subjects/${subjectId}` },
        { label: "المادة الامتحانية", href: `/subjects/${subjectId}/exam-material` }, { label: collection.title }]} />
      <h1 className="page-heading">{collection.title}</h1>
      <p className="page-subheading">{index.subject.title}</p>
      <SubjectTabs tabs={subjectTabs(subjectId)} activeKey="exam-material" />
      <ExamMaterialSections subjectId={subjectId} active="weekly" />
      <WeeklyExams key={paper.id} subjectId={subjectId} collection={collection} initialPaper={paper} />
    </section>;
}
