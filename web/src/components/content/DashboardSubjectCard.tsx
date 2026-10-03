import Link from "next/link";
import type { Subject } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ReferenceArtwork } from "@/components/ui/ReferenceArtwork";
import { getSubjectTheme, subjectArtwork } from "./subjectTheme";

export function DashboardSubjectCard({ subject, index, lectureCount }: { subject: Subject; index: number; lectureCount: number | null }) {
  const theme = getSubjectTheme(subject.title, index);
  return <Link href={`/subjects/${subject.id}`} className={`dl-subject-card dl-theme-${theme}`}>
    <ReferenceArtwork {...subjectArtwork[theme]} className="dl-subject-icon" />
    <h3><span>{subject.title.split(/ (?=وتحليل البيانات|والتنظيمية|السيبراني|المشاريع)/).map((line, lineIndex) => <span key={line}>{lineIndex ? <br /> : null}{line}</span>)}</span></h3>
    <span className="dl-lecture-count"><PlatformIcon name="video" /><span>{lectureCount === null ? "—" : lectureCount} محاضرة</span></span>
    <span className="dl-subject-button"><span>عرض المادة</span><PlatformIcon name="arrow" /></span>
  </Link>;
}
