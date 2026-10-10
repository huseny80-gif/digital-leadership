import Link from "next/link";
import { libraryEntriesPresentation } from "@digital-leadership/shared";
import type { LibrarySection, Subject, SubjectLibrary } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { ErrorState, NotFoundState, EmptyState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { LibraryEntryContent, librarySections } from "@/components/content/LibraryContent";
import { LibrarySummaryPrint } from "@/components/printing/LibrarySummaryPrint";

export default async function SubjectLibraryPage({ params, searchParams }: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ section?: string; entry?: string }>;
}) {
  const { subjectId } = await params;
  const query = await searchParams;
  const section: LibrarySection = query.section && Object.hasOwn(librarySections, query.section) ? query.section as LibrarySection : "summaries";
  let library: SubjectLibrary;
  let subject: Subject;
  try {
    const result = await Promise.all([apiGet<SubjectLibrary>("/api/v1/subjects/" + subjectId + "/library"), apiGet<Subject>("/api/v1/subjects/" + subjectId)]);
    library = result[0].data; subject = result[1].data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return <NotFoundState message="المادة غير متاحة." />;
    return <ErrorState message="تعذّر تحميل المحتوى. يرجى المحاولة مرة أخرى." retryHref={"/subjects/" + subjectId + "/library?section=" + section} />;
  }
  const entries = library.entries.filter(e => e.section === section);
  const selected = query.entry ? entries.find(e => e.id === query.entry) : undefined;
  if (query.entry && !selected) return <NotFoundState message="المحتوى غير متاح." />;
  return <section>
    {section === "summaries" && entries.length ? <LibrarySummaryPrint title={`${subject.title} — ${selected?.title ?? "الملخصات الدراسية"}`} subjectId={subjectId} entries={selected ? [selected] : entries} /> : null}
    <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: subject.title, href: "/subjects/" + subjectId }, { label: librarySections[section] }]} />
    <h1 className="page-heading">{librarySections[section]}</h1><p className="page-subheading">{subject.title}</p>
    <SubjectTabs tabs={subjectTabs(subjectId)} activeKey={section} />
    {["resources", "references", "summaries"].includes(section) ? <p><Link href={`/subjects/reports?subject=${subjectId}`} className="text-link">إعداد تقرير أكاديمي من مصادر هذه المادة</Link></p> : null}
    {selected ? <><p><Link className="text-link" href={"?section=" + section}>عرض جميع المحتويات</Link></p><LibraryEntryContent entry={selected} subjectId={subjectId} /></> : entries.length ? <div className="dl-library-list">{libraryEntriesPresentation(entries).map(entry => <LibraryEntryContent key={entry.id} entry={entry} subjectId={subjectId} />)}</div> : <EmptyState title="لا يوجد محتوى منشور في هذا القسم بعد" message="سيظهر المحتوى هنا فور نشره." />}
  </section>;
}
