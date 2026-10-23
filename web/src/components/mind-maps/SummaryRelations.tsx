import type { SummaryVisualDocument, SummaryVisualPoint, SummaryVisualSequence } from "@shared/index";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { drawFlow, drawingDisabled, finishDrawing } from "./mindMapDraw";
import { words } from "./SummaryMindTree";
import styles from "./SummaryVisuals.module.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Draws its children with the mind map's pen on mount, on a new selection and on «إعادة الرسم»; any click or key finishes it. */
function DrawnCanvas({ drawKey, children }: { drawKey: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), running = useRef<Animation[]>([]), [again, setAgain] = useState(0);
  const skip = () => { finishDrawing(running.current); running.current = []; };
  useIsoLayoutEffect(() => {
    if (!box.current || drawingDisabled()) return;
    skip(); running.current = drawFlow(box.current);
    return skip;
  }, [drawKey, again]);
  const busy = () => running.current.some(animation => animation.playState === "running" || animation.pending);
  return <div ref={box} className={styles.canvas} onPointerDownCapture={() => { if (busy()) skip(); }} onKeyDownCapture={() => { if (busy()) skip(); }}><button type="button" className={`${styles.quietButton} ${styles.redraw}`} onClick={() => setAgain(value => value + 1)}>إعادة الرسم</button>{children}</div>;
}

export function SummaryConceptMap({ document, sectionId, onSection, selectedId, onSelect, replay }: {
  document: SummaryVisualDocument; sectionId: string; onSection: (id: string) => void; selectedId: string; onSelect: (id: string) => void; replay: number;
}) {
  const drawKey = `${document.lecture.id}:${sectionId}:${replay}`;
  const points = document.sections.flatMap(section => section.points), section = document.sections.find(section => section.id === sectionId) ?? document.sections[0]!;
  const pointCard = (point: SummaryVisualPoint, className = styles.principle) => <button type="button" key={point.id} data-draw="card" className={className} aria-pressed={selectedId === point.id} onClick={() => onSelect(point.id)}><strong>{words(point.label)}</strong>{" "}<span data-word="">{point.text}</span></button>;
  if (!document.triad) return <DrawnCanvas drawKey={drawKey}>
    <label className={styles.selectLabel}>المحور <select value={section.id} onChange={event => onSection(event.target.value)}>{document.sections.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <p className={styles.caption}>تنتظم هذه المفاهيم تحت المحور المحدد في الملخص المعتمد.</p>
    <div className={styles.conceptHub}><h3 data-draw="card">{words(section.title)}</h3><span className={styles.hubStem} data-draw="line" aria-hidden="true" /></div>
    <span className={styles.gridRule} data-draw="line" data-origin="center" aria-hidden="true" />
    <div className={styles.conceptGrid}>{section.points.map(point => pointCard(point))}</div>
  </DrawnCanvas>;
  const triad = document.triad, members = triad.pointIds.map(id => points.find(point => point.id === id)!).filter(Boolean);
  const auth = points.find(point => point.id === triad.flow?.pointId);
  return <DrawnCanvas drawKey={drawKey}>
    <div className={styles.conceptLayout}>
      <div className={styles.triangle}>
        <svg className={styles.triangleSvg} viewBox="0 0 360 330" preserveAspectRatio="none" aria-hidden="true"><path data-draw="path" pathLength={1} className={styles.drawPath} d="M180 42 L57 263 L303 263 Z" fill="rgba(115,228,219,.025)" stroke="#4f7f80" strokeWidth="1.4" /></svg>
        {members.map((point, index) => <button type="button" key={point.id} data-draw="card" className={styles.triangleNode} data-corner={index} aria-pressed={selectedId === point.id} onClick={() => onSelect(point.id)}><span>{point.label.split(" (")[0]}</span>{" "}<bdi>{point.label.match(/\((.+)\)/u)?.[1]}</bdi></button>)}
        <div className={styles.triangleCenter} data-draw="fade"><strong>{triad.title}</strong><small>مبادئ أمن المعلومات</small></div>
      </div>
      <div className={styles.principles}>{members.map(point => pointCard(point))}</div>
    </div>
    {triad.flow && auth ? <div className={styles.relationBlock}><h3>{auth.label}</h3><div className={styles.authFlow}>{triad.flow.labels.map((label, index) => <div key={label} className={styles.authStep}>{index > 0 ? <span className={styles.flowArrow} data-draw="pop" aria-hidden="true">←</span> : null}<button type="button" data-draw="card" className={`${styles.principle} ${styles.authNode}`} onClick={() => onSelect(auth.id)} aria-pressed={selectedId === auth.id}><strong>{label}</strong>{" "}<small>{index ? "تحديد الصلاحيات" : "التحقق من الهوية"}</small></button></div>)}</div><p className={styles.relationNote} data-draw="fade">{triad.flow.summaryQuote}.</p></div> : null}
    {triad.complementaryPointIds.map(id => points.find(point => point.id === id)).filter((point): point is SummaryVisualPoint => Boolean(point)).map(point => pointCard(point, `${styles.principle} ${styles.complementary}`))}
  </DrawnCanvas>;
}

const kindLabels: Record<SummaryVisualSequence["kind"], string> = { source_order: "ترتيب المحاور كما وردت في الملخص؛ لا يمثل تسلسلًا زمنيًا أو علاقة سببية.", process: "مراحل إجرائية يذكرها الملخص المعتمد صراحةً.", history: "تسلسل تاريخي ورد في المحاضرة والملخص المعتمد.", cycle: "دورة مراحل وردت في الملخص المعتمد؛ اختَر مرحلة لقراءة شرحها." };

export function SummarySequence({ document, sequenceId, onSequence, selectedId, onSelect, replay }: {
  document: SummaryVisualDocument; sequenceId: string; onSequence: (id: string) => void; selectedId: string; onSelect: (id: string) => void; replay: number;
}) {
  const sequence = document.sequences.find(item => item.id === sequenceId) ?? document.sequences[0]!;
  return <DrawnCanvas drawKey={`${document.lecture.id}:${sequence.id}:${replay}`}>
    <label className={styles.selectLabel}>المخطط <select value={sequence.id} onChange={event => onSequence(event.target.value)}>{document.sequences.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <div className={styles.sequenceIntro}><h3>{sequence.title}</h3><p>{kindLabels[sequence.kind]}</p></div>
    <div className={styles.sequenceTrack}><span className={styles.sequenceSpine} data-draw="track" aria-hidden="true" /><ol className={styles.sequenceList} data-kind={sequence.kind}>{sequence.steps.map((step, index) => <li key={`${sequence.id}-${index}`}><span className={styles.marker} data-draw="pop" aria-hidden="true">{(index + 1).toLocaleString("ar")}</span><button type="button" data-draw="card" className={styles.stage} onClick={() => onSelect(step.pointId ?? step.sectionId ?? "")} aria-pressed={selectedId === (step.pointId ?? step.sectionId)}>{words(step.label)}</button></li>)}</ol></div>
    <p className={styles.sequenceNote}>اختَر عنصرًا لقراءة النقطة المرتبطة به ومراجعة اقتباساتها من المحاضرة.</p>
  </DrawnCanvas>;
}
