import Link from "next/link";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ReferenceArtwork } from "@/components/ui/ReferenceArtwork";
import { contentDate, type DashboardContent } from "@/lib/dashboardContent";
import { getSubjectTheme, subjectArtwork } from "./subjectTheme";
import { ActivityFeed } from "@/components/learning/ActivityFeed";

export function DashboardPanels({ content }: { content: DashboardContent }) {
  return <div className="dl-dashboard-panels">
    <section className="dl-preview-panel" id="latest-lectures" aria-labelledby="latest-lectures-title">
      <div className="dl-panel-heading"><h2 id="latest-lectures-title"><PlatformIcon name="clock" />آخر المحاضرات المضافة</h2><Link href="/subjects?view=lectures">عرض الكل <PlatformIcon name="next" /></Link></div>
      {content.lectures.slice(0, 3).map(({ lecture, subject }) => <Link className="dl-preview-row" href={`/subjects/${subject.id}/lectures/${lecture.id}`} key={lecture.id}>
        <ReferenceArtwork {...(getSubjectTheme(subject.title) === "ai" ? { x: 219, y: 609, width: 120, height: 31 } : subjectArtwork[getSubjectTheme(subject.title)])} className="dl-lecture-thumbnail" />
        <span className="dl-preview-copy"><strong>{lecture.title}</strong><small>{subject.title}</small></span>
        {contentDate(lecture.createdAt) ? <span className="dl-preview-date" title="تاريخ الإضافة"><PlatformIcon name="calendar" /><time dateTime={lecture.createdAt}>{contentDate(lecture.createdAt)}</time></span> : null}
      </Link>)}
      {content.lectures.length === 0 ? <p className="dl-panel-empty">{content.lecturesFailed ? "تعذّر تحميل المحاضرات. حاول مرة أخرى." : "لا توجد محاضرات متاحة حاليًا."}</p> : null}
    </section>
    <ActivityFeed />
  </div>;
}
