"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { ExamMaterialDetail, ExamMaterialGroup, ExamMaterialIndex } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ExamMaterialQuiz } from "./ExamMaterialQuiz";
import { examHref, examRequest } from "./request";
import styles from "./examMaterial.module.css";

function tabKeys(event: KeyboardEvent<HTMLButtonElement>, ids: string[], current: string, choose: (id: string) => void) {
  const index = ids.indexOf(current);
  const target = event.key === "Home" ? 0 : event.key === "End" ? ids.length - 1 : event.key === "ArrowLeft" ? (index + 1) % ids.length : event.key === "ArrowRight" ? (index - 1 + ids.length) % ids.length : -1;
  if (target < 0) return;
  event.preventDefault(); choose(ids[target]!);
  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons?.[target]?.focus();
}

export function ExamMaterialWorkspace({ initialIndex, initialDetail }: { initialIndex: ExamMaterialIndex; initialDetail: ExamMaterialDetail | null }) {
  const query = useSearchParams();
  const subjectId = initialIndex.subject.id;
  const [groups, setGroups] = useState<ExamMaterialGroup[]>(() => initialDetail && !initialIndex.groups.some(g => g.id === initialDetail.id) ? [initialDetail, ...initialIndex.groups] : initialIndex.groups);
  const [total, setTotal] = useState(initialIndex.total);
  const [page, setPage] = useState(initialIndex.page);
  const [selection, setSelection] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState(initialDetail);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const request = useRef<{ id: string; selection: string } | null>(null);
  const generatingRef = useRef(false);
  const cache = useRef(new Map(initialDetail ? [[initialDetail.id, initialDetail]] : []));
  const groupId = query.get("group") ?? initialDetail?.id ?? groups[0]?.id ?? null;
  const tab = query.get("tab") === "quiz" ? "quiz" : "summary";
  const selectedDetail = detail?.id === groupId ? detail : null;

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError(null);
      try {
        const group = cache.current.get(groupId!) ?? await examRequest<ExamMaterialDetail>(`/api/exam-material/${subjectId}/${encodeURIComponent(groupId!)}`, { signal: controller.signal });
        if (!controller.signal.aborted) { cache.current.set(group.id, group); setDetail(group); }
      } catch (error) { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "تعذر تحميل المجموعة."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [groupId, subjectId, retry]);

  function chooseGroup(id: string) { setMessage(null); window.history.pushState(null, "", examHref(subjectId, id, "summary")); }
  function chooseTab(next: "summary" | "quiz") { if (groupId) window.history.pushState(null, "", examHref(subjectId, groupId, next, query.get("attempt") ?? undefined)); }
  function changeSelection(ids: string[]) { if (generatingRef.current) return; setSelection(ids); request.current = null; setGenerationError(null); setMessage(null); }
  async function generate() {
    if (!selection.length || generatingRef.current) return;
    generatingRef.current = true; setGenerating(true); setGenerationError(null); setMessage(null);
    const signature = [...selection].sort().join(":");
    if (request.current?.selection !== signature) request.current = { id: crypto.randomUUID(), selection: signature };
    try {
      const group = await examRequest<ExamMaterialDetail>(`/api/admin/subjects/${subjectId}/exam-material`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lectureIds: selection, requestId: request.current.id }) });
      cache.current.set(group.id, group); setDetail(group);
      setGroups(previous => [group, ...previous.filter(g => g.id !== group.id)]);
      setTotal(previous => previous + (groups.some(g => g.id === group.id) ? 0 : 1));
      window.history.pushState(null, "", examHref(subjectId, group.id, "summary"));
      request.current = null;
      setMessage("تم توليد المحتوى الامتحاني وحفظ المجموعة بنجاح. المجموعات السابقة محفوظة في الأرشيف.");
    } catch (error) { setGenerationError(error instanceof Error ? error.message : "تعذر التوليد. حاول مرة أخرى."); }
    finally { generatingRef.current = false; setGenerating(false); }
  }
  async function loadMore() {
    if (moreBusy) return;
    setMoreBusy(true); setLoadError(null);
    try {
      const next = await examRequest<ExamMaterialIndex>(`/api/exam-material/${subjectId}?page=${page + 1}`);
      setGroups(previous => [...previous, ...next.groups.filter(g => !previous.some(old => old.id === g.id))]);
      setPage(next.page); setTotal(next.total);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "تعذر تحميل الأرشيف."); }
    finally { setMoreBusy(false); }
  }

  return <div className={styles.workspace}>
    <div className={styles.banner}><span className={styles.largeIcon}><PlatformIcon name="clipboard" /></span><div><h2>مراجعتك الامتحانية في مكان واحد</h2><p>ملخص شامل واختبار تفاعلي لكل مجموعة محاضرات، مع الاحتفاظ بجميع المجموعات السابقة.</p></div><Link href={`/subjects/${subjectId}`} className={styles.back}>العودة إلى المحاضرات <PlatformIcon name="arrow" /></Link></div>
    {initialIndex.canGenerate ? <section className={styles.admin} aria-labelledby="exam-admin-heading">
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>إعداد المحتوى — المدير</span><h2 id="exam-admin-heading">اختيار المحاضرات</h2></div><span className={styles.badge}>{selection.length} محاضرة محددة</span></div>
      <p className={styles.muted}>حدد المحاضرات المطلوبة ثم ولّد مجموعة جديدة. تُحفظ كل مجموعة بصورة مستقلة، مع ملخصها واختبارها.</p>
      {initialIndex.lectures.length ? <><fieldset className={styles.lectures} disabled={generating}><legend className={styles.srOnly}>المحاضرات المنشورة</legend>{initialIndex.lectures.map((lecture, index) => <label key={lecture.id} className={styles.lecture} data-selected={selection.includes(lecture.id)}><input type="checkbox" checked={selection.includes(lecture.id)} onChange={event => changeSelection(event.target.checked ? [...selection, lecture.id] : selection.filter(id => id !== lecture.id))} /><span className={styles.lectureNumber}>{lecture.orderIndex > 0 ? lecture.orderIndex : index + 1}</span><span>{lecture.title}</span></label>)}</fieldset>
        <div className={styles.controls}><div><button className={styles.quiet} disabled={generating || initialIndex.lectures.length > 50} onClick={() => changeSelection(initialIndex.lectures.map(l => l.id))}>تحديد الكل</button><button className={styles.quiet} disabled={generating || !selection.length} onClick={() => changeSelection([])}>إلغاء التحديد</button></div><button className={styles.action} disabled={generating || selection.length === 0 || selection.length > 50} onClick={() => void generate()}><PlatformIcon name="clipboard" />{generating ? "جارٍ توليد المحتوى…" : "توليد المحتوى الامتحاني"}</button></div>
        {selection.length > 50 ? <p role="alert">يمكن اختيار ٥٠ محاضرة كحد أقصى لكل مجموعة.</p> : null}
      </> : <p className={styles.notice}>لا توجد محاضرات منشورة للاختيار بعد.</p>}
      {generationError ? <p className={styles.error} role="alert">{generationError}</p> : null}
      {message ? <p className={styles.success} role="status">{message}</p> : null}
    </section> : null}
    <div className={styles.archiveLayout}>
      <aside className={styles.archive} aria-label="أرشيف المادة الامتحانية"><div className={styles.sectionHead}><h2>المجموعات الامتحانية</h2><span className={styles.badge}>{total}</span></div>
        {groups.length ? <div className={styles.groupList} role="tablist" aria-label="مجموعات المحاضرات">{groups.map(group => <button key={group.id} id={`group-${group.id}`} role="tab" aria-selected={groupId === group.id} aria-controls="exam-group-panel" tabIndex={groupId === group.id ? 0 : -1} className={styles.group} onClick={() => chooseGroup(group.id)} onKeyDown={event => tabKeys(event, groups.map(g => g.id), group.id, chooseGroup)}><span className={styles.groupTitle}>{group.title}</span><span className={styles.groupMeta}>المجموعة {group.sequence} · {group.questionCount} سؤالًا</span><time dateTime={group.createdAt}>{new Date(group.createdAt).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time></button>)}</div> : <p className={styles.muted}>ستظهر المجموعات هنا بعد توليدها من المدير.</p>}
        {groups.length < total ? <button className={styles.quiet} disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? "جارٍ التحميل…" : "عرض مجموعات أقدم"}</button> : null}
      </aside>
      <section id="exam-group-panel" role="tabpanel" aria-labelledby={groupId ? `group-${groupId}` : undefined} className={styles.content} aria-busy={loading}>
        {loading ? <p className={styles.notice} role="status">جارٍ تحميل المجموعة…</p> : loadError ? <div className={styles.notice} role="alert"><p>{loadError}</p><button className={styles.action} onClick={() => setRetry(v => v + 1)}>إعادة المحاولة</button></div> : selectedDetail ? <>
          <div className={styles.contentHead}><span className={styles.eyebrow}>المجموعة {selectedDetail.sequence}</span><h2>{selectedDetail.title}</h2><p className={styles.muted}>{selectedDetail.lectures.length} محاضرة · {selectedDetail.questionCount} سؤالًا</p></div>
          <div className={styles.innerTabs} role="tablist" aria-label="محتوى المجموعة"><button id="exam-summary-tab" role="tab" aria-selected={tab === "summary"} aria-controls="exam-summary-panel" tabIndex={tab === "summary" ? 0 : -1} onClick={() => chooseTab("summary")} onKeyDown={e => tabKeys(e, ["summary", "quiz"], "summary", id => chooseTab(id as "summary" | "quiz"))}><PlatformIcon name="document" />الملخص الشامل</button><button id="exam-quiz-tab" role="tab" aria-selected={tab === "quiz"} aria-controls="exam-quiz-panel" tabIndex={tab === "quiz" ? 0 : -1} onClick={() => chooseTab("quiz")} onKeyDown={e => tabKeys(e, ["summary", "quiz"], "quiz", id => chooseTab(id as "summary" | "quiz"))}><PlatformIcon name="quiz" />الاختبار التفاعلي المتقدم</button></div>
          {tab === "summary" ? <article id="exam-summary-panel" role="tabpanel" aria-labelledby="exam-summary-tab" className={styles.summary}><p className={styles.introduction}>{selectedDetail.summary.introduction}</p>{selectedDetail.summary.sections.map(section => <section key={section.id} className={styles.summarySection}><div className={styles.sectionHead}><h3>{section.title}</h3><Link href={`/subjects/${subjectId}/lectures/${section.id}`} className={styles.sourceLink}>المحاضرة الأصلية <PlatformIcon name="arrow" /></Link></div>{section.text.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.keyPoints.length ? <details className={styles.keyPoints}><summary>نقاط أساسية للمراجعة</summary><ul>{section.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></details> : null}</section>)}</article> : <div id="exam-quiz-panel" role="tabpanel" aria-labelledby="exam-quiz-tab"><ExamMaterialQuiz key={selectedDetail.id} group={selectedDetail} /></div>}
        </> : <div className={styles.empty}><PlatformIcon name="book" /><h2>لا توجد مجموعة امتحانية بعد</h2><p>{initialIndex.canGenerate ? "اختر المحاضرات أعلاه لبدء إعداد أول مجموعة." : "ستتوفر الملخصات والاختبارات هنا فور نشر مجموعة امتحانية."}</p></div>}
      </section>
    </div>
  </div>;
}
