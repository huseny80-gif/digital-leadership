import Link from "next/link";
import type { Subject } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { SubjectIcon } from "./SubjectIcon";
import { getSubjectTheme } from "./subjectTheme";

export function DashboardSubjectCard({ subject, index, lectureCount }: { subject: Subject; index: number; lectureCount: number | null }) {
  const theme = getSubjectTheme(subject.title, index);
  return <Link href={`/subjects/${subject.id}`} className={`dl-subject-card dl-theme-${theme}`}>
    <span className="dl-subject-icon"><SubjectIcon theme={theme} idPrefix={`subject-${subject.id}`} /></span>
    <h3>{subject.title}</h3>
    <span className="dl-lecture-count"><PlatformIcon name="video" /><span>{lectureCount === null ? "—" : lectureCount} محاضرة</span></span>
    <span className="dl-subject-button"><span>عرض المادة</span><PlatformIcon name="arrow" /></span>
  </Link>;
}
