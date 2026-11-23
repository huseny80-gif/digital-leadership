import { reflectiveQuestions } from "@/content/reflectiveQuestions";
import styles from "./ReflectiveQuestions.module.css";

/** Static reviewed answers; the cover and author credit of the source file are deliberately not republished. */
export function ReflectiveQuestions() {
  const { questions, references, subtitle, author } = reflectiveQuestions;
  return <div className={styles.workspace}>
    <header className={styles.intro}>
      <h2>{reflectiveQuestions.title}</h2>
      <p>{subtitle}. المحاضر: {author}. اضغط على السؤال لعرض الإجابة المختصرة والأساس النظري والإجابة النموذجية والتوصيات.</p>
    </header>
    <nav className={styles.index} aria-label="فهرس الأسئلة الفكرية">
      {questions.map(item => <a key={item.number} href={`#question-${item.number}`}>السؤال {item.number}</a>)}
    </nav>
    <div>
      {questions.map(item => <details className={styles.question} id={`question-${item.number}`} key={item.number}>
        <summary><span className={styles.number}>{item.number}</span><h3>{item.question}</h3></summary>
        <div className={styles.body}>
          <p className={styles.short}><strong>الإجابة المختصرة: </strong>{item.shortAnswer}</p>
          <section><h4>الأساس النظري (إدغار شاين)</h4><p>{item.theoreticalBasis}</p></section>
          <section><h4>الإجابة النموذجية التفصيلية</h4>{item.detailedAnswer.map(paragraph => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}</section>
          <section><h4>التوصيات التنفيذية</h4><ul>{item.recommendations.map(rec => <li key={rec}>{rec}</li>)}</ul></section>
          <p className={styles.conclusion}>الخلاصة: {item.conclusion}</p>
        </div>
      </details>)}
    </div>
    <section className={styles.references} aria-label="المراجع">
      <h2>المراجع</h2>
      <ul>{references.map(reference => <li key={reference}>{reference}</li>)}</ul>
    </section>
  </div>;
}
