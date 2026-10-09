"use client";

import { useMemo, useState } from "react";
import type { ExamReviewArtifacts } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./examMaterial.module.css";

export function ExamMindMap({ map }: { map: ExamReviewArtifacts["mindMap"] }) {
  const root = map.nodes.find(node => node.kind === "root")!;
  const lectures = map.nodes.filter(node => node.kind === "lecture");
  const [selectedId, setSelectedId] = useState(root.id);
  const [lectureId, setLectureId] = useState("all");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const selected = map.nodes.find(node => node.id === selectedId) ?? root;
  const term = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => new Set(map.nodes.filter(node => `${node.label} ${node.description}`.toLocaleLowerCase().includes(term)).map(node => node.id)), [map.nodes, term]);
  const displayed = lectures.filter(lecture => (lectureId === "all" || lecture.lectureId === lectureId) && (!term || matches.has(lecture.id) || map.nodes.some(node => node.parentId === lecture.id && matches.has(node.id))));
  const related = map.edges.filter(edge => edge.kind === "shared" && (edge.from === selected.id || edge.to === selected.id)).map(edge => map.nodes.find(node => node.id === (edge.from === selected.id ? edge.to : edge.from))!);

  return <div id="exam-map-panel" role="tabpanel" aria-labelledby="exam-map-tab" className={styles.mapPanel}>
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>التعلم البصري</span><h3>خريطة المفاهيم التفاعلية</h3></div><span className={styles.badge}>{map.nodes.filter(node => ["topic", "concept"].includes(node.kind)).length} مفهوم ومحور</span></div>
    <p className={styles.muted}>اختر أي عقدة لقراءة شرحها. تربط الخطوط المحاضرات بمفاهيمها؛ وتشير الروابط المشتركة إلى ورود المصطلح نفسه في أكثر من محاضرة.</p>
    <div className={styles.mapToolbar}>
      <label><PlatformIcon name="search" /><input aria-label="بحث في خريطة المفاهيم" type="search" placeholder="ابحث عن مفهوم…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="محاضرات الخريطة" value={lectureId} onChange={event => setLectureId(event.target.value)}><option value="all">جميع المحاضرات</option>{lectures.map(lecture => <option key={lecture.id} value={lecture.lectureId!}>{lecture.label}</option>)}</select>
      <div><button type="button" className={styles.quiet} aria-label="تصغير الخريطة" disabled={zoom <= 0.8} onClick={() => setZoom(value => Math.max(0.8, value - 0.1))}>−</button><button type="button" className={styles.quiet} aria-label="إعادة حجم الخريطة" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" className={styles.quiet} aria-label="تكبير الخريطة" disabled={zoom >= 1.3} onClick={() => setZoom(value => Math.min(1.3, value + 0.1))}>+</button></div>
      <button type="button" className={styles.quiet} onClick={() => setCollapsed(collapsed.length === lectures.length ? [] : lectures.map(lecture => lecture.id))}>{collapsed.length === lectures.length ? "توسيع الكل" : "طيّ الكل"}</button>
    </div>
    <div className={styles.mapLayout}>
      <div className={styles.mapViewport} tabIndex={0} aria-label="الخريطة؛ يمكن التمرير داخلها">
        <div className={styles.mindTree} style={{ fontSize: `${zoom}rem` }}>
          <button type="button" className={styles.mapRoot} aria-pressed={selectedId === root.id} onClick={() => setSelectedId(root.id)}><PlatformIcon name="network" /><span>{root.label}</span></button>
          {displayed.length ? <ul className={styles.mapBranches}>{displayed.map(lecture => {
            const children = map.nodes.filter(node => node.parentId === lecture.id && (!term || matches.has(node.id)));
            const folded = !term && collapsed.includes(lecture.id);
            return <li key={lecture.id} className={styles.mapBranch}>
              <div className={styles.mapLectureRow}><button type="button" className={styles.mapLecture} aria-pressed={selectedId === lecture.id} onClick={() => setSelectedId(lecture.id)}><PlatformIcon name="book" />{lecture.label}</button><button type="button" className={styles.mapFold} aria-label={`${folded ? "توسيع" : "طيّ"} مفاهيم ${lecture.label}`} aria-expanded={!folded} onClick={() => setCollapsed(previous => previous.includes(lecture.id) ? previous.filter(id => id !== lecture.id) : [...previous, lecture.id])}>{folded ? "+" : "−"}</button></div>
              {!folded ? <ul className={styles.mapLeaves}>{children.map(node => <li key={node.id}><button type="button" className={styles.mapNode} data-kind={node.kind} aria-pressed={selectedId === node.id} onClick={() => setSelectedId(node.id)}><span>{node.label}</span>{map.edges.some(edge => edge.kind === "shared" && (edge.from === node.id || edge.to === node.id)) ? <span className={styles.sharedMarker} aria-label="مصطلح مشترك">↔</span> : null}</button></li>)}</ul> : null}
            </li>;
          })}</ul> : <p className={styles.notice}>لا توجد نتائج لهذا البحث.</p>}
        </div>
      </div>
      <aside className={styles.mapDetails} aria-label="شرح المفهوم المحدد" aria-live="polite">
        <span className={styles.eyebrow}>{selected.kind === "concept" ? "مفهوم من المحاضرة" : selected.kind === "topic" ? "محور من المحاضرة" : "المحتوى المختار"}</span><h4>{selected.label}</h4>
        <div className={styles.mapDescription}>{selected.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        {selected.lectureId ? <a className={styles.sourceLink} href={`#summary-lecture-${selected.lectureId}`} onClick={event => { event.preventDefault(); const url = new URL(window.location.href); url.searchParams.set("tab", "summary"); url.hash = `summary-lecture-${selected.lectureId}`; window.history.pushState(null, "", url); }}>عرض المفهوم في الملخص <PlatformIcon name="arrow" /></a> : null}
        {related.length ? <div className={styles.mapRelated}><h5>يرد المصطلح أيضاً في</h5>{related.map(node => <button type="button" className={styles.quiet} key={node.id} onClick={() => setSelectedId(node.id)}>{lectures.find(lecture => lecture.lectureId === node.lectureId)?.label}</button>)}</div> : null}
      </aside>
    </div>
  </div>;
}
