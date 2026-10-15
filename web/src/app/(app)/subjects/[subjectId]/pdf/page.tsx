import type { Subject } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { loadSubjectPdfDocuments } from "@/lib/content/subjectPdf";
import { ErrorState, NotFoundState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { SubjectPdfLibrary } from "@/components/content/SubjectPdfLibrary";

export default async function SubjectPdfPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = await params;
  let subject: Subject;
  try { subject = (await apiGet<Subject>(`/api/v1/subjects/${subjectId}`)).data; }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundState message="المادة غير متاحة." />;
    return <ErrorState message="تعذّر تحميل ملفات المادة." retryHref={`/subjects/${subjectId}/pdf`} />;
  }
  const { documents, partial } = await loadSubjectPdfDocuments(subjectId);
  return <section>
    <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: "PDF", href: "/subjects/pdf" }, { label: subject.title }]} />
    <h1 className="page-heading">PDF — {subject.title}</h1><p className="page-subheading">الملفات الأصلية للمادة ومحاضراتها، للقراءة والتحميل.</p>
    <SubjectTabs tabs={subjectTabs(subjectId)} activeKey="pdf" />
    {partial ? <ErrorState message="تعذّر تحميل بعض الملفات. يمكنك إعادة المحاولة." retryHref={`/subjects/${subjectId}/pdf`} /> : null}
    <SubjectPdfLibrary subjectId={subjectId} documents={documents} />
  </section>;
}
