import type { SummaryVisualDocument, SummaryVisualPoint, SummaryVisualSequence } from "@shared/index";
import styles from "./SummaryVisuals.module.css";

export function SummaryConceptMap({ document, sectionId, onSection, selectedId, onSelect }: {
  document: SummaryVisualDocument; sectionId: string; onSection: (id: string) => void; selectedId: string; onSelect: (id: string) => void;
}) {
  const points = document.sections.flatMap(section => section.points), section = document.sections.find(section => section.id === sectionId) ?? document.sections[0]!;
  const pointCard = (point: SummaryVisualPoint, className = styles.principle) => <button type="button" key={point.id} className={className} aria-pressed={selectedId === point.id} onClick={() => onSelect(point.id)}><strong>{point.label}</strong>{" "}<span>{point.text}</span></button>;
  if (!document.triad) return <div className={styles.canvas}>
    <label className={styles.selectLabel}>المحور <select value={section.id} onChange={event => onSection(event.target.value)}>{document.sections.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <p className={styles.caption}>تنتظم هذه المفاهيم تحت المحور المحدد في الملخص المعتمد.</p>
    <div className={styles.conceptHub}><h3>{section.title}</h3><span aria-hidden="true">│</span></div>
    <div className={styles.conceptGrid}>{section.points.map(point => pointCard(point))}</div>
  </div>;
  const triad = document.triad, members = triad.pointIds.map(id => points.find(point => point.id === id)!).filter(Boolean);
  const auth = points.find(point => point.id === triad.flow?.pointId);
  return <div className={styles.canvas}>
    <div className={styles.conceptLayout}>
      <div className={styles.triangle}>
        <svg className={styles.triangleSvg} viewBox="0 0 360 330" preserveAspectRatio="none" aria-hidden="true"><path d="M180 42 L57 263 L303 263 Z" fill="rgba(115,228,219,.025)" stroke="#698397" strokeWidth="1.4" /></svg>
        {members.map((point, index) => <button type="button" key={point.id} className={styles.triangleNode} data-corner={index} aria-pressed={selectedId === point.id} onClick={() => onSelect(point.id)}><span>{point.label.split(" (")[0]}</span>{" "}<bdi>{point.label.match(/\((.+)\)/u)?.[1]}</bdi></button>)}
        <div className={styles.triangleCenter}><strong>{triad.title}</strong><small>مبادئ أمن المعلومات</small></div>
      </div>
      <div className={styles.principles}>{members.map(point => pointCard(point))}</div>
    </div>
    {triad.flow && auth ? <div className={styles.relationBlock}><h3>{auth.label}</h3><div className={styles.authFlow}>{triad.flow.labels.map((label, index) => <div key={label} className={styles.authStep}>{index > 0 ? <span className={styles.flowArrow} aria-hidden="true">←</span> : null}<button type="button" className={`${styles.principle} ${styles.authNode}`} onClick={() => onSelect(auth.id)} aria-pressed={selectedId === auth.id}><strong>{label}</strong>{" "}<small>{index ? "تحديد الصلاحيات" : "التحقق من الهوية"}</small></button></div>)}</div><p className={styles.relationNote}>{triad.flow.summaryQuote}.</p></div> : null}
    {triad.complementaryPointIds.map(id => points.find(point => point.id === id)).filter((point): point is SummaryVisualPoint => Boolean(point)).map(point => pointCard(point, `${styles.principle} ${styles.complementary}`))}
  </div>;
}

const kindLabels: Record<SummaryVisualSequence["kind"], string> = { source_order: "ترتيب المحاور كما وردت في الملخص؛ لا يمثل تسلسلًا زمنيًا أو علاقة سببية.", process: "مراحل إجرائية يذكرها الملخص المعتمد صراحةً.", history: "تسلسل تاريخي ورد في المحاضرة والملخص المعتمد.", cycle: "دورة مراحل وردت في الملخص المعتمد؛ اختَر مرحلة لقراءة شرحها." };

export function SummarySequence({ document, sequenceId, onSequence, selectedId, onSelect }: {
  document: SummaryVisualDocument; sequenceId: string; onSequence: (id: string) => void; selectedId: string; onSelect: (id: string) => void;
}) {
  const sequence = document.sequences.find(item => item.id === sequenceId) ?? document.sequences[0]!;
  return <div className={styles.canvas}>
    <label className={styles.selectLabel}>المخطط <select value={sequence.id} onChange={event => onSequence(event.target.value)}>{document.sequences.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <div className={styles.sequenceIntro}><h3>{sequence.title}</h3><p>{kindLabels[sequence.kind]}</p></div>
    <ol className={styles.sequenceList} data-kind={sequence.kind}>{sequence.steps.map((step, index) => <li key={`${sequence.id}-${index}`}><span className={styles.marker} aria-hidden="true">{(index + 1).toLocaleString("ar")}</span><button type="button" className={styles.stage} onClick={() => onSelect(step.pointId ?? step.sectionId ?? "")} aria-pressed={selectedId === (step.pointId ?? step.sectionId)}>{step.label}</button></li>)}</ol>
    <p className={styles.sequenceNote}>اختَر عنصرًا لقراءة النقطة المرتبطة به ومراجعة اقتباساتها من المحاضرة.</p>
  </div>;
}
