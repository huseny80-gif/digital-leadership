import Link from "next/link";
import { WEEKLY_CYBER_SUBJECT_ID } from "@digital-leadership/shared";
import styles from "./weeklyExams.module.css";

export function ExamMaterialSections({ subjectId, active }: { subjectId: string; active: "groups" | "weekly" }) {
  if (subjectId !== WEEKLY_CYBER_SUBJECT_ID) return null;
  const root = `/subjects/${subjectId}/exam-material`;
  return <nav className={styles.sections} aria-label="أقسام المادة الامتحانية">
    <Link href={root} aria-current={active === "groups" ? "page" : undefined}>مجموعات المحاضرات</Link>
    <Link href={`${root}/weekly-tests`} aria-current={active === "weekly" ? "page" : undefined}>اختبارات د. ضياء الأسبوعية</Link>
  </nav>;
}
