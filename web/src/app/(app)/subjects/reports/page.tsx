import type { StudyCatalog } from "@shared/index";
import { apiGet } from "@/lib/api/client";
import { ErrorState } from "@/components/ui/States";
import { ReportBuilder } from "@/components/study-tools/ReportBuilder";

export const metadata = { title: "التقارير الأكاديمية | منصة القيادة الرقمية" };
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const query = await searchParams;
  let catalog: StudyCatalog, subjectId: string | undefined;
  try {
    catalog = (await apiGet<StudyCatalog>("/api/v1/study-tools/catalog")).data;
    subjectId = query.subject && catalog.subjects.some(subject => subject.id === query.subject) ? query.subject : catalog.subjects[0]?.id;
    if (subjectId) catalog = (await apiGet<StudyCatalog>(`/api/v1/study-tools/catalog?subjectId=${subjectId}&limit=100`)).data;
  } catch { return <ErrorState message="تعذر تحميل مصادر التقارير. يرجى المحاولة مرة أخرى." retryHref="/subjects/reports" />; }
  return <ReportBuilder initialCatalog={catalog} {...(subjectId ? { initialSubjectId: subjectId } : {})} />;
}
