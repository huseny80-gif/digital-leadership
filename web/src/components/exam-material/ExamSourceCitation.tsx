import type { ExamContextReference } from "@shared/index";
import styles from "./examMaterial.module.css";

export function ExamSourceCitation({ reference }: { reference: ExamContextReference }) {
  return <details className={styles.sourceCitation}>
    <summary><span>{reference.filename}</span><small>الفقرة {reference.number} · الأسطر {reference.startLine}–{reference.endLine} من النص المستخرج</small></summary>
    <blockquote dir="auto">{reference.excerpt}</blockquote>
    <small>اقتباس من نسخة المحاضرة التي بُنيت عليها هذه المراجعة.</small>
  </details>;
}
