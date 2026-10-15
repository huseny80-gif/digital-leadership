import Link from "next/link";
import type { Subject } from "@shared/index";
import { apiGetPaginated } from "@/lib/api/client";
import { ErrorState, EmptyState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { StudyDirectoryTabs } from "@/components/content/StudyDirectoryTabs";
import styles from "@/components/content/subjectPdf.module.css";

export const metadata = { title: "PDF | المواد الدراسية | القيادة الرقمية" };

export default async function PdfFoldersPage() {
  let subjects: Subject[];
  try { subjects = (await apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=100")).data; }
  catch { return <ErrorState message="تعذّر تحميل مجلدات المواد." retryHref="/subjects/pdf" />; }
  return <section>
    <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: "PDF" }]} />
    <h1 className="page-heading">PDF</h1><p className="page-subheading">ملفات المواد ومحاضراتها الأصلية، في مجلد مستقل لكل مادة.</p>
    <StudyDirectoryTabs active="pdf" />
    {subjects.length ? <div className={styles.folders}>{[...subjects].sort((a,b) => a.orderIndex-b.orderIndex).map(subject => <Link className={styles.folder} key={subject.id} href={`/subjects/${subject.id}/pdf`}><PlatformIcon name="folder" /><div><h2>{subject.title}</h2><p>فتح ملفات المادة ومحاضراتها · PDF</p></div></Link>)}</div> : <EmptyState title="لا توجد مواد متاحة حاليًا" message="تظهر المجلدات عند نشر المواد الدراسية." />}
  </section>;
}
