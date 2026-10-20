import { useEffect, useRef, type CSSProperties } from "react";
import type { SummaryVisualDocument } from "@shared/index";
import { normalizeSearchText } from "@digital-leadership/shared";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./SummaryVisuals.module.css";

export function SummaryMindTree({ document, query, size, collapsed, onToggle, selectedId, onSelect }: {
  document: SummaryVisualDocument; query: string; size: number; collapsed: Set<string>;
  onToggle: (id: string) => void; selectedId: string; onSelect: (id: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null), root = useRef<HTMLButtonElement>(null), edges = useRef<SVGSVGElement>(null);
  const needle = normalizeSearchText(query).trim();
  const filtered = document.sections.map(section => ({ ...section, points: !needle || normalizeSearchText(section.title).includes(needle) ? section.points : section.points.filter(point => normalizeSearchText(`${point.label} ${point.text}`).includes(needle)) })).filter(section => section.points.length);
  useEffect(() => {
    const body = canvas.current, center = root.current, svg = edges.current;
    if (!body || !center || !svg) return;
    function draw() {
      if (!body || !center || !svg) return;
      const box = body.getBoundingClientRect(), start = center.getBoundingClientRect();
      svg.replaceChildren();
      if (!box.width || !box.height) return;
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      svg.setAttribute("width", String(box.width)); svg.setAttribute("height", String(box.height));
      const x0 = start.left + start.width / 2 - box.left, y0 = start.bottom - box.top;
      const grid = body.querySelector<HTMLElement>("[data-branches]");
      const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/u).length : 1;
      body.querySelectorAll<HTMLElement>("[data-branch-header]").forEach(header => {
        const rect = header.getBoundingClientRect(), y = rect.top + rect.height / 2 - box.top;
        let d: string;
        if (columns === 1) d = `M${x0},${y0} V${y0 + 16} H${box.width - 4} V${y} H${rect.right - box.left}`;
        else if (columns === 2) d = `M${x0},${y0} V${y} H${rect.left + rect.width / 2 - box.left > x0 ? rect.left - box.left : rect.right - box.left}`;
        else { const x = rect.left + rect.width / 2 - box.left, top = rect.top - box.top; d = `M${x0},${y0} C${x0},${y0 + 24} ${x},${top - 24} ${x},${top}`; }
        const path = window.document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", getComputedStyle(header).getPropertyValue("--mm-branch").trim());
        path.setAttribute("stroke-width", "1.3"); path.setAttribute("opacity", ".7"); path.dataset.to = header.dataset.branchHeader;
        svg.append(path);
      });
    }
    draw();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(draw) : undefined;
    observer?.observe(body); window.addEventListener("resize", draw);
    void window.document.fonts?.ready.then(draw);
    return () => { observer?.disconnect(); window.removeEventListener("resize", draw); };
  }, [document, query, size, collapsed]);
  return <div className={styles.canvas}>
    {filtered.length ? <div ref={canvas} className={styles.mapBody} style={{ "--mm-map-font": `${14 * size / 100}px` } as CSSProperties}>
      <svg ref={edges} className={styles.connectors} aria-hidden="true" focusable="false" />
      <button type="button" ref={root} className={styles.root} onClick={() => onSelect("")}><PlatformIcon name="network" />{document.lecture.title}</button>
      <ul className={`${styles.branches} ${filtered.length <= 4 ? styles.singleRow : ""}`} style={{ "--mm-columns": filtered.length } as CSSProperties} data-branches>
        {filtered.map(section => {
          const open = Boolean(needle) || !collapsed.has(section.id);
          return <li key={section.id} className={styles.branch} data-color={document.sections.findIndex(item => item.id === section.id) % 4}>
            <button type="button" className={styles.branchHead} data-branch-header={section.id} aria-expanded={open} aria-controls={`leaves-${section.id}`} onClick={() => onToggle(section.id)}>
              <span>{section.title}</span><span className={styles.branchMeta}><span className={styles.count}>{section.points.length.toLocaleString("ar")}</span><span aria-hidden="true">{open ? "−" : "+"}</span></span>
            </button>
            <ul id={`leaves-${section.id}`} hidden={!open} className={styles.leaves}>
              {section.points.map(point => <li key={point.id}><button type="button" className={styles.node} aria-pressed={selectedId === point.id} onClick={() => onSelect(point.id)}><span>{point.label}</span><span aria-hidden="true">←</span></button></li>)}
            </ul>
          </li>;
        })}
      </ul>
    </div> : <div className={styles.empty}><h3>لا توجد مفاهيم مطابقة</h3><p>جرّب مصطلحًا آخر أو امسح البحث.</p></div>}
  </div>;
}
