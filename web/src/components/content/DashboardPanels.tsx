import Link from "next/link";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ReferenceArtwork } from "@/components/ui/ReferenceArtwork";
import { contentDate, type DashboardContent } from "@/lib/dashboardContent";
import { getSubjectTheme, subjectArtwork } from "./subjectTheme";
import { ActivityFeed } from "@/components/learning/ActivityFeed";
import { DashboardDisclosure } from "./DashboardDisclosure";

export function DashboardPanels({ content }: { content: DashboardContent }) {
  const latestLectures = content.lectures.slice(0, 3);
  return <div className="dl-dashboard-panels">
    <DashboardDisclosure id="latest-lectures" title="آخر المحاضرات المضافة" icon="clock" count={latestLectures.length ? latestLectures.length.toLocaleString("ar") : content.lecturesFailed ? "تعذّر التحميل" : "٠"}>
      <div className="dl-disclosure-toolbar"><Link href="/subjects?view=lectures">عرض جميع المحاضرات <PlatformIcon name="next" /></Link></div>
      {latestLectures.map(({ lecture, subject }) => <Link className="dl-preview-row" href={`/subjects/${subject.id}/lectures/${lecture.id}`} key={lecture.id}>
        <ReferenceArtwork {...(getSubjectTheme(subject.title) === "ai" ? { x: 219, y: 609, width: 120, height: 31 } : subjectArtwork[getSubjectTheme(subject.title)])} className="dl-lecture-thumbnail" />
        <span className="dl-preview-copy"><strong>{lecture.title}</strong><small>{subject.title}</small></span>
        {contentDate(lecture.createdAt) ? <span className="dl-preview-date" title="تاريخ الإضافة"><PlatformIcon name="calendar" /><time dateTime={lecture.createdAt}>{contentDate(lecture.createdAt)}</time></span> : null}
      </Link>)}
      {content.lectures.length === 0 ? <p className="dl-panel-empty">{content.lecturesFailed ? "تعذّر تحميل المحاضرات. حاول مرة أخرى." : "لا توجد محاضرات متاحة حاليًا."}</p> : null}
    </DashboardDisclosure>
    <ActivityFeed />
  </div>;
}
