import type { Subject } from "@shared/index";
import { SubjectCard } from "./SubjectCard";

export function DashboardSubjectCard({ subject, index, lectureCount }: { subject: Subject; index: number; lectureCount: number | null }) {
  return <SubjectCard subject={subject} index={index} lectureCount={lectureCount} />;
}
