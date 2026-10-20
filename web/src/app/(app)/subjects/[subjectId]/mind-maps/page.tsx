import type { SummaryVisualDocument, SummaryVisualIndex } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { ErrorState, NotFoundState, EmptyState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { SubjectMindMaps } from "@/components/mind-maps/SubjectMindMaps";

export default async function MindMapsPage({ params, searchParams }: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ lecture?: string | string[] }>;
}) {
  const { subjectId } = await params, query = await searchParams;
  const base = `/subjects/${subjectId}/mind-maps`;
  let index: SummaryVisualIndex, document: SummaryVisualDocument | undefined;
  let loadError = false;
  try {
    index = (await apiGet<SummaryVisualIndex>(`/api/v1${base}`)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundState message="المادة غير متاحة." />;
    return <ErrorState title="تعذر تحميل الخرائط الذهنية" message="يرجى المحاولة مرة أخرى." retryHref={base} />;
  }
  const selectedId = typeof query.lecture === "string" ? query.lecture : undefined;
  if (query.lecture && !index.lectures.some(lecture => lecture.id === selectedId)) return <NotFoundState message="المحاضرة غير متاحة ضمن هذه المادة." />;
  const selected = selectedId ? index.lectures.find(lecture => lecture.id === selectedId) : index.lectures.find(lecture => lecture.available);
  if (selected?.available) {
    try { document = (await apiGet<SummaryVisualDocument>(`/api/v1${base}/${selected.id}`)).data; }
    catch (error) { if (error instanceof ApiError && error.status === 404) return <NotFoundState message="المحاضرة غير متاحة." />; loadError = true; }
  }
  return <section dir="rtl">
    <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: index.subject.title, href: `/subjects/${subjectId}` }, { label: "خرائط ذهنية" }]} />
    <h1 className="page-heading">خرائط ذهنية</h1>
    <p className="page-subheading">{index.subject.title} — مفاهيم مترابطة من ملخصات المحاضرات المعتمدة.</p>
    <SubjectTabs tabs={subjectTabs(subjectId)} activeKey="mind-maps" />
    {index.lectures.length ? <SubjectMindMaps key={`${document?.lecture.id ?? "empty"}-${document?.source.summaryRevision ?? ""}`} index={index} document={document} selectedId={typeof query.lecture === "string" ? query.lecture : undefined} loadError={loadError} /> : <EmptyState title="لا توجد محاضرات منشورة بعد" message="ستظهر خرائط المحاضرات عند توفر ملخصاتها المعتمدة." />}
  </section>;
}
