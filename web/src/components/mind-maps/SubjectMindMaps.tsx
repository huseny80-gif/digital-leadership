"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent } from "react";
import type { SummaryVisualDocument, SummaryVisualIndex, SummaryVisualPoint } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { SummaryMindTree } from "./SummaryMindTree";
import { SummaryConceptMap, SummarySequence } from "./SummaryRelations";
import styles from "./SummaryVisuals.module.css";

const views = [{ id: "mind", label: "خريطة ذهنية", icon: "network" }, { id: "concepts", label: "خريطة المفاهيم", icon: "globe" }, { id: "sequence", label: "مخطط التسلسل", icon: "chart" }] as const;
type View = typeof views[number]["id"];
const subscribeCompact = (listener: () => void) => { const media = window.matchMedia?.("(max-width: 600px)"); media?.addEventListener("change", listener); return () => media?.removeEventListener("change", listener); };
const isCompact = () => window.matchMedia?.("(max-width: 600px)").matches ?? false;
const serverCompact = () => false;

export function SubjectMindMaps({ index, document, selectedId, loadError }: {
  index: SummaryVisualIndex; document?: SummaryVisualDocument | undefined; selectedId?: string | undefined; loadError: boolean;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const base = `/subjects/${index.subject.id}/mind-maps`;
  const selected = selectedId ?? document?.lecture.id ?? index.lectures.find(lecture => lecture.available)?.id ?? index.lectures[0]?.id ?? "";
  return <div className={styles.shell} dir="rtl" aria-busy={pending}>
    <div className={styles.lectureBar}><label className={styles.selectLabel}>المحاضرة <select aria-label="اختيار المحاضرة" value={selected} disabled={pending} onChange={event => { const id = event.target.value; if (index.lectures.some(lecture => lecture.id === id)) startTransition(() => router.push(`${base}?lecture=${encodeURIComponent(id)}`, { scroll: false })); }}>
      {index.lectures.map(lecture => <option key={lecture.id} value={lecture.id}>{lecture.title}{lecture.available ? "" : " — لا يتوفر ملخص معتمد"}</option>)}
    </select></label><span role="status" className={styles.muted}>{pending ? "جارٍ تحميل الخريطة…" : "مفاهيم وشروح موثقة بالمصدر"}</span></div>
    {document ? <SummaryVisualViewer key={`${document.lecture.id}-${document.source.summaryRevision}`} document={document} /> : <div className={styles.empty}><h2>{loadError ? "تعذر التحقق من الخريطة" : "لا تتوفر خريطة معتمدة لهذه المحاضرة"}</h2><p>{loadError ? "تعذر مطابقة مصدر المحاضرة بملخصها المعتمد. أعد المحاولة أو اختَر محاضرة أخرى." : "ستظهر الخريطة بعد اعتماد ملخص مرتبط بملف المحاضرة."}</p>{loadError ? <button type="button" className={styles.quietButton} onClick={() => startTransition(() => router.refresh())}>إعادة المحاولة</button> : null}</div>}
  </div>;
}

export function SummaryVisualViewer({ document }: { document: SummaryVisualDocument }) {
  const id = useId(), tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const [view, setView] = useState<View>("mind"), [query, setQuery] = useState(""), [size, setSize] = useState(100);
  const [replay, setReplay] = useState(0), [manualCollapsed, setCollapsed] = useState<Set<string> | null>(null), [selectedId, setSelectedId] = useState("");
  const [sectionId, setSectionId] = useState(document.sections[0]?.id ?? ""), [sequenceId, setSequenceId] = useState(document.sequences[0]?.id ?? "");
  const compact = useSyncExternalStore(subscribeCompact, isCompact, serverCompact);
  const collapsed = manualCollapsed ?? new Set(compact || document.sections.length > 4 ? document.sections.map(section => section.id) : []);
  const points = document.sections.flatMap(section => section.points), selectedPoint = points.find(point => point.id === selectedId), selectedSection = document.sections.find(section => section.id === selectedId);
  function changeView(next: View) { setView(next); setSelectedId(""); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowLeft" ? (index + 1) % views.length : event.key === "ArrowRight" ? (index - 1 + views.length) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : undefined;
    if (next === undefined) return; event.preventDefault(); changeView(views[next]!.id); tabs.current[next]?.focus();
  }
  function reset() { setQuery(""); setSize(100); setCollapsed(null); setSelectedId(""); }
  const total = points.length;
  return <>
    <div className={styles.intro}><div><p className={styles.eyebrow}>من النص إلى الفهم البصري</p><h2>{document.lecture.title}</h2><p className={styles.muted}>استكشف المحاور، ثم اختَر مفهومًا لقراءة شرحه ومرجعه.</p></div><div className={styles.sourceSummary}><strong>{document.sections.length.toLocaleString("ar")} محاور · {total.toLocaleString("ar")} مفهومًا</strong><span>المصدر: <bdi>{document.source.filename}</bdi></span></div></div>
    <div className={styles.workspace}>
      <div className={styles.tabs} role="tablist" aria-label="طريقة عرض الخريطة">{views.map((tab, index) => <button type="button" ref={element => { tabs.current[index] = element; }} key={tab.id} id={`${id}-tab-${tab.id}`} role="tab" aria-selected={view === tab.id} aria-controls={`${id}-panel-${tab.id}`} tabIndex={view === tab.id ? 0 : -1} className={styles.tab} onClick={() => changeView(tab.id)} onKeyDown={event => tabKey(event, index)}><PlatformIcon name={tab.icon} />{tab.label}</button>)}</div>
      {views.map(tab => <div key={tab.id} id={`${id}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab.id}`} hidden={view !== tab.id}>
        {view === tab.id && (tab.id === "mind" ? <>
          <div className={styles.toolbar}><label className={styles.search}><PlatformIcon name="search" /><input type="search" aria-label="البحث في مفاهيم الخريطة" placeholder="ابحث عن مفهوم أو شرح…" value={query} onChange={event => setQuery(event.target.value)} /></label><div className={styles.tools}>
            <button type="button" className={styles.quietButton} onClick={() => setCollapsed(new Set(collapsed.size === document.sections.length ? [] : document.sections.map(section => section.id)))}>{collapsed.size === document.sections.length ? "توسيع المحاور" : "طيّ المحاور"}</button>
            <div className={styles.sizing} aria-label="تكبير الخريطة وتصغيرها"><button type="button" aria-label="تصغير الخريطة" disabled={size <= 60} onClick={() => setSize(size - 10)}>−</button><output aria-label="نسبة التكبير">{size.toLocaleString("ar")}%</output><button type="button" aria-label="تكبير الخريطة" disabled={size >= 150} onClick={() => setSize(size + 10)}>+</button></div>
            <button type="button" className={styles.quietButton} onClick={() => setReplay(value => value + 1)}>إعادة الرسم</button>
            <button type="button" className={styles.quietButton} onClick={reset}>إعادة الضبط</button>
          </div></div><p className={styles.caption}>المحاضرة ← المحاور ← المفاهيم. افتح المحور أو اطوِه، ثم اختر مفهومًا لعرض شرحه ومراجعه.</p>
          <SummaryMindTree document={document} query={query} size={size} compact={compact} replay={replay} collapsed={collapsed} onToggle={id => { const next = new Set(collapsed); if (next.has(id)) next.delete(id); else next.add(id); setCollapsed(next); }} selectedId={selectedId} onSelect={setSelectedId} />
        </> : tab.id === "concepts" ? <SummaryConceptMap replay={replay} document={document} sectionId={sectionId} onSection={id => { setSectionId(id); setSelectedId(""); }} selectedId={selectedId} onSelect={setSelectedId} /> : <SummarySequence replay={replay} document={document} sequenceId={sequenceId} onSequence={id => { setSequenceId(id); setSelectedId(""); }} selectedId={selectedId} onSelect={setSelectedId} />)}
      </div>)}
      <div className={styles.canvasFooter}><span>روابط بنيوية من الملخص المعتمد</span><span>{view === "mind" ? "اختَر مفهومًا لعرض شرحه ومراجعه" : selectedId ? <a href={`#${id}-detail`}>قراءة الشرح والمرجع ↓</a> : "اختَر مفهومًا لعرض شرحه أدناه"}</span></div>
    </div>
    {view === "mind" ? <ConceptDialog document={document} pointId={selectedPoint ? selectedPoint.id : ""} onSelect={setSelectedId} /> : <section id={`${id}-detail`} className={styles.detail} aria-label="شرح المفهوم ومرجعه" aria-live="polite">
      {selectedPoint ? <><p className={styles.eyebrow}>{document.sections.find(section => section.points.some(point => point.id === selectedPoint.id))?.title}</p><PointExplanation point={selectedPoint} filename={document.source.filename} /></> : selectedSection ? <><h2>{selectedSection.title}</h2><div className={styles.sectionPoints}>{selectedSection.points.map(point => <button key={point.id} type="button" className={styles.quietButton} onClick={() => setSelectedId(point.id)}>{point.label}</button>)}</div><p className={styles.muted}>اختَر مفهومًا من هذا المحور لقراءة شرحه واقتباساته.</p></> : <><h2>شرح المفهوم</h2><p className={styles.muted}>اختَر عقدة في الخريطة لعرض شرحها من الملخص المعتمد واقتباساتها من المحاضرة.</p></>}
      <Link className={styles.sourceLink} href={`/subjects/${document.subject.id}/lectures/${document.lecture.id}`}><PlatformIcon name="book" />فتح المحاضرة الأصلية</Link>
    </section>}
  </>;
}

/** Glass dialog for a mind-map concept: explanation, source quotes, linked files, and stepping within its section. */
function ConceptDialog({ document, pointId, onSelect }: { document: SummaryVisualDocument; pointId: string; onSelect: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const section = document.sections.find(item => item.points.some(point => point.id === pointId)), index = section?.points.findIndex(point => point.id === pointId) ?? -1, point = section?.points[index];
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    if (point && !element.open) { if (typeof element.showModal === "function") element.showModal(); else element.setAttribute("open", ""); }
    if (!point && element.open) { if (typeof element.close === "function") element.close(); else element.removeAttribute("open"); }
  }, [point]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onClose={() => { if (pointId) onSelect(""); }} onClick={event => { if (event.target === event.currentTarget) onSelect(""); }}>
    {point && section ? <>
      <div className={styles.dialogHead}><div className={styles.crumbs}><span>{document.lecture.title}</span><span>{section.title}</span></div><h2 id={titleId}>{point.label}</h2></div>
      <div className={styles.dialogBody}>
        <section><h3>الشرح</h3><p className={styles.explanation}>{point.text}</p></section>
        <section><h3>من نص المحاضرة</h3><div className={styles.evidence}><p className={styles.muted}>الإحداثيات التالية أسطر في النص المستخرج، وليست أرقام صفحات PDF.</p><ul>{point.evidence.map((evidence, i) => <li key={i}><blockquote dir="auto">{evidence.quote}</blockquote><small><bdi>{document.source.filename}</bdi> · الأسطر {evidence.startLine.toLocaleString("ar")}–{evidence.endLine.toLocaleString("ar")}</small></li>)}</ul></div></section>
        <section><h3>الملفات المرتبطة</h3><div className={styles.files}>
          <Link href={`/subjects/${document.subject.id}/lectures/${document.lecture.id}`}><PlatformIcon name="book" />فتح المحاضرة الأصلية <bdi>({document.source.filename})</bdi></Link>
          <Link href={`/subjects/${document.subject.id}/library?section=summaries`}><PlatformIcon name="document" />ملخصات المادة</Link>
        </div></section>
      </div>
      <div className={styles.dialogFoot}>
        <div><button type="button" className={styles.quietButton} disabled={index <= 0} onClick={() => onSelect(section.points[index - 1]!.id)}>السابق</button><button type="button" className={styles.quietButton} disabled={index >= section.points.length - 1} onClick={() => onSelect(section.points[index + 1]!.id)}>التالي</button></div>
        <span className={styles.position}>{(index + 1).toLocaleString("ar")} / {section.points.length.toLocaleString("ar")}</span>
        <button type="button" className={styles.quietButton} onClick={() => onSelect("")}>إغلاق</button>
      </div>
    </> : null}
  </dialog>;
}

function PointExplanation({ point, filename }: { point: SummaryVisualPoint; filename: string }) {
  return <><h2>{point.label}</h2><p className={styles.explanation}>{point.text}</p><details key={point.id} className={styles.evidence}><summary>اقتباسات من المصدر ({point.evidence.length.toLocaleString("ar")})</summary><p className={styles.muted}>الإحداثيات التالية أسطر في النص المستخرج، وليست أرقام صفحات PDF.</p><ul>{point.evidence.map((evidence, index) => <li key={index}><blockquote dir="auto">{evidence.quote}</blockquote><small><bdi>{filename}</bdi> · الأسطر {evidence.startLine.toLocaleString("ar")}–{evidence.endLine.toLocaleString("ar")}</small></li>)}</ul></details></>;
}
