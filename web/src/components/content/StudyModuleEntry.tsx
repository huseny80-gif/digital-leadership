import { studyModulesForSubject } from "./studyModules";
import styles from "./StudyModuleEntry.module.css";

export function StudyModuleEntry({ subjectId, section }: { subjectId: string; section: "summaries" | "comprehensive" }) {
  const modules = studyModulesForSubject(subjectId);
  if (!modules) return null;
  const summaries = section === "summaries";
  const title = summaries ? "الملخصات والبودكاست القيادي" : "الاختبار الشامل";
  return <aside className={styles.entry} aria-label={title}>
    <div><h2>{title}</h2><p>{summaries ? "راجع ملخص كل محاضرة واختر صوت تسجيلها. تظهر حالة إتاحة التسجيل داخل الملخص." : "راجع محاضرات الابتكار بأسئلة متنوعة، مع التصحيح والتغذية الراجعة ونماذج الإجابات."}</p></div>
    <a className={styles.action} href={modules[section]}>{summaries ? "افتح الملخصات والبودكاست" : "افتح الاختبار الشامل"}<span aria-hidden="true"> ←</span></a>
  </aside>;
}
