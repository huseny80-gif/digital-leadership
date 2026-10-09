import Link from "next/link";
import type { Subject } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { SubjectIcon } from "./SubjectIcon";
import { getSubjectTheme } from "./subjectTheme";

/** Shared artwork, palette and interaction for dashboard and directory cards. */
export function SubjectCard({ subject, index = 0, lectureCount, compact = false }: {
  subject: Subject; index?: number; lectureCount?: number | null; compact?: boolean;
}) {
  const theme = getSubjectTheme(subject.title, index);
  return (
    <Link href={`/subjects/${subject.id}`} className={`dl-subject-card dl-theme-${theme}${compact ? " dl-subject-card--compact" : ""}`}>
      <span className="dl-subject-icon"><SubjectIcon theme={theme} idPrefix={`subject-${compact ? "compact-" : ""}${subject.id}`} /></span>
      <h3>{subject.title}</h3>
      {lectureCount !== undefined ? <span className="dl-lecture-count"><PlatformIcon name="video" /><span>{lectureCount === null ? "—" : lectureCount} محاضرة</span></span> : subject.description ? <span className="dl-subject-description" title={subject.description}>{subject.description}</span> : null}
      <span className="dl-subject-button"><span>عرض المادة</span><PlatformIcon name="arrow" /></span>
    </Link>
  );
}
