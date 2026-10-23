import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { SummaryVisualDocument } from "@shared/index";
import { normalizeSearchText } from "@digital-leadership/shared";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { drawingDisabled, drawMindMap, finishDrawing, type DrawTree } from "./mindMapDraw";
import styles from "./SummaryVisuals.module.css";

/** Whole words animate in one by one; splitting letters would break Arabic joining. */
export const words = (text: string) => text.split(" ").flatMap((word, index) => [index ? " " : "", <span key={index} data-word="">{word}</span>]);

/** Fixed node boxes keep the layout a pure function of the data; labels clamp to two lines. */
const BOX = { root: { w: 250, h: 76 }, section: { w: 240, h: 66 }, point: { w: 270, h: 56 } } as const;
const GAP = 72, ROW = 66, PAD = 32;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Placed { id: string; kind: "root" | "section" | "point"; x: number; y: number; parent?: string }

/** Right-anchored RTL tree: lecture on the right, its sections in the middle, concepts on the left. */
export function mindTreeLayout(sections: Array<{ id: string; points: Array<{ id: string }> }>, isOpen: (id: string) => boolean) {
  const xRoot = BOX.section.w + BOX.point.w + GAP * 2 + PAD, xSection = BOX.point.w + GAP + PAD, xPoint = PAD;
  const placed: Placed[] = [];
  let row = 0;
  for (const section of sections) {
    const leaves = isOpen(section.id) ? section.points : [];
    const first = row;
    for (const point of leaves) placed.push({ id: point.id, kind: "point", x: xPoint, y: PAD + row++ * ROW + ROW / 2, parent: section.id });
    if (!leaves.length) row++;
    placed.push({ id: section.id, kind: "section", x: xSection, y: PAD + ((first + row - 1) / 2) * ROW + ROW / 2, parent: "root" });
  }
  const sectionYs = placed.filter(node => node.kind === "section").map(node => node.y);
  placed.push({ id: "root", kind: "root", x: xRoot, y: sectionYs.length ? (sectionYs[0]! + sectionYs[sectionYs.length - 1]!) / 2 : PAD + ROW / 2 });
  return { placed, width: xRoot + BOX.root.w + PAD, height: Math.max(row, 1) * ROW + PAD * 2 };
}

export function SummaryMindTree({ document, query, size, collapsed, compact, replay, onToggle, selectedId, onSelect }: {
  document: SummaryVisualDocument; query: string; size: number; collapsed: Set<string>; compact: boolean; replay: number;
  onToggle: (id: string) => void; selectedId: string; onSelect: (id: string) => void;
}) {
  const needle = normalizeSearchText(query).trim();
  const matches = (text: string) => Boolean(needle) && normalizeSearchText(text).includes(needle);
  const filtered = document.sections.map(section => ({ ...section, points: !needle || normalizeSearchText(section.title).includes(needle) ? section.points : section.points.filter(point => normalizeSearchText(`${point.label} ${point.text}`).includes(needle)) })).filter(section => section.points.length);
  const isOpen = (id: string) => Boolean(needle) || !collapsed.has(id);
  const sectionOf = new Map(document.sections.flatMap(section => section.points.map(point => [point.id, section.id] as const)));
  const activePath = new Set(selectedId ? ["root", sectionOf.get(selectedId) ?? selectedId, selectedId] : []);
  const viewport = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null), [dragging, setDragging] = useState(false);
  const { placed, width, height } = mindTreeLayout(filtered, isOpen);
  const scale = size / 100, at = new Map(placed.map(node => [node.id, node]));
  const world = useRef<HTMLDivElement>(null), pens = useRef<HTMLDivElement>(null), running = useRef<Animation[]>([]);
  const [fullDraw, setFullDraw] = useState(0), previouslyOpen = useRef<Set<string> | null>(null);
  const drawTree = (sections: typeof filtered): DrawTree => ({ id: "root", children: sections.map(section => ({ id: section.id, children: isOpen(section.id) ? section.points.map(point => ({ id: point.id, children: [] })) : [] })) });
  const playing = () => running.current.some(animation => animation.playState === "running" || animation.pending);
  function skip() { finishDrawing(running.current); running.current = []; }

  // Full scene on first view, on a click on the lecture, and on "إعادة الرسم".
  useIsoLayoutEffect(() => {
    if (compact || needle || !world.current || !pens.current || drawingDisabled()) return;
    skip(); running.current = drawMindMap(world.current, pens.current, drawTree(filtered), true);
  }, [replay, fullDraw, document.lecture.id, compact]);
  // A section that just opened draws only its own branch.
  useIsoLayoutEffect(() => {
    const open = new Set(filtered.filter(section => isOpen(section.id)).map(section => section.id)), before = previouslyOpen.current;
    previouslyOpen.current = open;
    if (!before || compact || needle || !world.current || !pens.current || drawingDisabled()) return;
    const opened = filtered.filter(section => open.has(section.id) && !before.has(section.id));
    if (!opened.length) return;
    skip(); running.current = opened.flatMap(section => drawMindMap(world.current!, pens.current!, drawTree([section]).children[0]!, false));
  });

  // Anchor the lecture (right edge) in view whenever the tree shape changes.
  const shapeKey = `${width}:${height}:${size}`;
  useIsoLayoutEffect(() => {
    const box = viewport.current?.getBoundingClientRect();
    setOffset({ x: box?.width ? Math.min(0, box.width - width * scale) : 0, y: 0 });
  }, [shapeKey]);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (playing() && !(event.target as HTMLElement).closest("button")) { skip(); return; }
    if ((event.target as HTMLElement).closest("button") || !offset) return;
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture?.(event.pointerId); setDragging(true);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current; if (!start) return;
    setOffset({ x: start.ox + event.clientX - start.x, y: start.oy + event.clientY - start.y });
  }
  function pointerUp() { drag.current = null; setDragging(false); }

  // Arrow keys move between visible nodes; in RTL, left goes deeper and right goes back up.
  function keyNav(event: KeyboardEvent<HTMLElement>) {
    if (playing()) { skip(); if (event.key !== "Tab") { event.preventDefault(); return; } }
    const current = (event.target as HTMLElement).closest<HTMLElement>("[data-node]");
    if (!current) return;
    const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-node]")], index = nodes.indexOf(current), id = current.dataset.node!;
    const focus = (target?: string) => { if (target) event.currentTarget.querySelector<HTMLElement>(`[data-node="${CSS.escape(target)}"]`)?.focus(); };
    if (event.key === "ArrowDown") nodes[index + 1]?.focus();
    else if (event.key === "ArrowUp") nodes[index - 1]?.focus();
    else if (event.key === "ArrowLeft") { if (current.dataset.kind === "section" && !isOpen(id)) onToggle(id); else focus(id === "root" ? filtered[0]?.id : filtered.find(section => section.id === id)?.points[0]?.id); }
    else if (event.key === "ArrowRight") { if (current.dataset.kind === "section" && isOpen(id) && !needle) onToggle(id); else focus(current.dataset.kind === "point" ? sectionOf.get(id) : "root"); }
    else return;
    event.preventDefault();
  }

  if (!filtered.length) return <div className={styles.canvas}><div className={styles.empty}><h3>لا توجد مفاهيم مطابقة</h3><p>جرّب كلمة أخرى أو امسح البحث.</p></div></div>;

  const rootButton = <button type="button" data-node="root" data-kind="root" className={styles.mmRoot} onClick={() => { onSelect(""); setFullDraw(value => value + 1); }}><PlatformIcon name="network" /><span className={styles.mmLabel}>{words(document.lecture.title)}</span></button>;
  const sectionButton = (section: typeof filtered[number]) => {
    const open = isOpen(section.id);
    return <button type="button" data-node={section.id} data-kind="section" className={`${styles.mmSection} ${matches(section.title) ? styles.mmHit : ""} ${activePath.has(section.id) ? styles.mmPath : ""}`} aria-expanded={open} aria-controls={`leaves-${section.id}`} onClick={() => onToggle(section.id)}>
      <span className={styles.mmLabel}>{words(section.title)}</span><span className={styles.mmFold} data-word="" aria-hidden="true">{open ? "−" : `+ ${section.points.length.toLocaleString("ar")}`}</span>
    </button>;
  };
  const pointButton = (point: typeof filtered[number]["points"][number]) => <button type="button" data-node={point.id} data-kind="point" className={`${styles.mmPoint} ${matches(`${point.label} ${point.text}`) ? styles.mmHit : ""}`} aria-pressed={selectedId === point.id} onClick={() => onSelect(point.id)}><span className={styles.mmLabel}>{words(point.label)}</span></button>;

  if (compact) return <div className={styles.canvas} onKeyDown={keyNav}>
    {rootButton}
    <ul className={styles.mmList}>{filtered.map(section => <li key={section.id}>{sectionButton(section)}
      <ul id={`leaves-${section.id}`} hidden={!isOpen(section.id)}>{section.points.map(point => <li key={point.id}>{pointButton(point)}</li>)}</ul>
    </li>)}</ul>
  </div>;

  const links = placed.filter(node => node.parent).map(node => {
    const parent = at.get(node.parent!)!, from = { x: parent.x, y: parent.y }, to = { x: node.x + BOX[node.kind].w, y: node.y }, mid = (from.x + to.x) / 2;
    return <path key={node.id} data-to={node.id} pathLength={1} className={activePath.has(node.id) ? styles.mmLinkOn : styles.mmLink} d={`M${from.x},${from.y} C${mid},${from.y} ${mid},${to.y} ${to.x},${to.y}`} />;
  });
  const frame = (kind: keyof typeof BOX) => <svg className={styles.mmFrame} width={BOX[kind].w} height={BOX[kind].h} aria-hidden="true" focusable="false"><rect x={1} y={1} width={BOX[kind].w - 2} height={BOX[kind].h - 2} rx={kind === "point" ? 12 : 16} pathLength={1} /></svg>;
  const place = (id: string, kind: keyof typeof BOX): CSSProperties => { const node = at.get(id)!; return { left: node.x, top: node.y - BOX[kind].h / 2, width: BOX[kind].w, height: BOX[kind].h }; };
  return <div ref={viewport} className={`${styles.mmViewport} ${dragging ? styles.mmDragging : ""} ${needle ? styles.mmSearching : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onKeyDown={keyNav}>
    <div ref={world} className={styles.mmWorld} style={{ width, height, transform: `translate(${offset?.x ?? 0}px, ${offset?.y ?? 0}px) scale(${scale})` }}>
      <svg className={styles.mmLinks} width={width} height={height} aria-hidden="true" focusable="false">{links}</svg>
      <div ref={pens} className={styles.mmPens} aria-hidden="true" />
      <div className={styles.mmAt} data-at="root" style={place("root", "root")}>{frame("root")}{rootButton}</div>
      {filtered.map(section => <div key={section.id}>
        <div className={styles.mmAt} data-at={section.id} style={place(section.id, "section")}>{frame("section")}{sectionButton(section)}</div>
        <div id={`leaves-${section.id}`} hidden={!isOpen(section.id)}>{isOpen(section.id) ? section.points.map(point => <div key={point.id} className={styles.mmAt} data-at={point.id} style={place(point.id, "point")}>{frame("point")}{pointButton(point)}</div>) : null}</div>
      </div>)}
    </div>
    <p className={styles.mmHint} aria-hidden="true">انقر المحاضرة لإعادة رسمها · اسحب للتنقل · أي نقرة أثناء الرسم تُكمله</p>
  </div>;
}
