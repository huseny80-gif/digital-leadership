"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { ExamMaterialDetail, ExamMaterialGroup, ExamMaterialIndex } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { ExamInstructorGuide } from "./ExamInstructorGuide";
import { ExamMaterialQuiz } from "./ExamMaterialQuiz";
import { ExamGroupTitle } from "./ExamGroupTitle";
import { ExamAcademicSummary } from "./ExamAcademicSummary";
import { ExamMaterialHistory } from "./ExamMaterialHistory";
import { ExamMindMap } from "./ExamMindMap";
import { ExamRevisionPackage } from "./ExamRevisionPackage";
import { generateExamReviewArtifacts } from "@digital-leadership/shared";
import { examHref, examRequest, type ExamMaterialTab } from "./request";
import styles from "./examMaterial.module.css";

const contentTabs: Array<{ id: ExamMaterialTab; label: string; icon: string }> = [{ id: "summary", label: "الملخص الشامل", icon: "document" }, { id: "map", label: "خريطة المفاهيم", icon: "network" }, { id: "quiz", label: "الاختبار التفاعلي المتقدم", icon: "quiz" }, { id: "package", label: "حزمة المراجعة", icon: "download" }];

function selectionKey(group: ExamMaterialGroup) {
  return JSON.stringify([group.subjectId, [...new Set(group.lectures.map(lecture => lecture.id))].sort()]);
}
/** Merge paginated results and bookmarked revisions without adding duplicate selections. */
function mergeGroups(...lists: ExamMaterialGroup[][]): ExamMaterialGroup[] {
  const latest = new Map<string, ExamMaterialGroup>();
  for (const group of lists.flat()) {
    const key = selectionKey(group), previous = latest.get(key);
    if (!previous || group.sequence > previous.sequence || (group.sequence === previous.sequence && (group.revisionCount ?? 1) >= (previous.revisionCount ?? 1))) latest.set(key, group);
  }
  return [...latest.values()].sort((a, b) => b.sequence - a.sequence || a.id.localeCompare(b.id));
}

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
  const [groups, setGroups] = useState<ExamMaterialGroup[]>(() => mergeGroups(initialIndex.groups, initialDetail ? [initialDetail.currentRevision ?? initialDetail] : []));
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
  const [listError, setListError] = useState<string | null>(null);
  const indexRequest = useRef<AbortController | null>(null);
  const request = useRef<{ id: string; selection: string } | null>(null);
  const generatingRef = useRef(false);
  const cache = useRef(new Map(initialDetail ? [[initialDetail.id, initialDetail]] : []));
  const groupId = query.get("group") ?? initialDetail?.id ?? groups[0]?.id ?? null;
  const tab: ExamMaterialTab = contentTabs.find(item => item.id === query.get("tab"))?.id ?? "summary";
  const selectedDetail = detail?.id === groupId ? detail : null;
  const currentRevision = selectedDetail ? groups.find(group => selectionKey(group) === selectionKey(selectedDetail)) ?? selectedDetail.currentRevision ?? selectedDetail : null;
  const activeGroupId = currentRevision?.id ?? groupId;
  const historical = Boolean(currentRevision && groupId !== currentRevision.id);
  const review = selectedDetail ? selectedDetail.review ?? generateExamReviewArtifacts(selectedDetail.summary, selectedDetail.title) : null;

  useEffect(() => () => indexRequest.current?.abort(), []);

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError(null);
      try {
        const group = cache.current.get(groupId!) ?? await examRequest<ExamMaterialDetail>(`/api/exam-material/${subjectId}/${encodeURIComponent(groupId!)}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          cache.current.set(group.id, group); setDetail(group);
          setGroups(previous => mergeGroups(previous, [group.currentRevision ?? group]));
        }
      } catch (error) { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "تعذر تحميل المجموعة."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [groupId, subjectId, retry]);

  function chooseGroup(id: string) { setMessage(null); window.history.pushState(null, "", examHref(subjectId, id, "summary")); }
  function chooseTab(next: ExamMaterialTab) { if (groupId) window.history.pushState(null, "", examHref(subjectId, groupId, next, query.get("attempt") ?? undefined)); }
  function changeSelection(ids: string[]) { if (generatingRef.current) return; setSelection(ids); request.current = null; setGenerationError(null); setMessage(null); }
  async function refreshIndex() {
    indexRequest.current?.abort();
    const controller = new AbortController(); indexRequest.current = controller;
    setMoreBusy(true); setListError(null);
    try {
      const next = await examRequest<ExamMaterialIndex>(`/api/exam-material/${subjectId}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setGroups(previous => mergeGroups(next.groups, previous)); setPage(next.page); setTotal(next.total);
    } catch (error) { if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "تعذر تحديث قائمة المجموعات."); }
    finally { if (!controller.signal.aborted) setMoreBusy(false); }
  }
  async function generate(lectureIds = selection) {
    if (!lectureIds.length || generatingRef.current) return;
    generatingRef.current = true; setGenerating(true); setGenerationError(null); setMessage(null);
    const signature = [...lectureIds].sort().join(":");
    if (request.current?.selection !== signature) request.current = { id: crypto.randomUUID(), selection: signature };
    try {
      const group = await examRequest<ExamMaterialDetail>(`/api/admin/subjects/${subjectId}/exam-material`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lectureIds, requestId: request.current.id }) });
      cache.current.set(group.id, group); setDetail(group);
      setGroups(previous => mergeGroups(previous, [group.currentRevision ?? group]));
      setTotal(previous => previous + (group.revisionCount === 1 ? 1 : 0));
      window.history.pushState(null, "", examHref(subjectId, group.id, "summary"));
      request.current = null;
      setMessage("تم توليد المحتوى الامتحاني وحفظ المجموعة بنجاح. تظهر أحدث مراجعة للمحاضرات، وتُحفظ المراجعات السابقة في الأرشيف.");
      await refreshIndex();
    } catch (error) { setGenerationError(error instanceof Error ? error.message : "تعذر التوليد. حاول مرة أخرى."); }
    finally { generatingRef.current = false; setGenerating(false); }
  }
  async function loadMore() {
    if (moreBusy || generatingRef.current) return;
    indexRequest.current?.abort();
    const controller = new AbortController(); indexRequest.current = controller;
    setMoreBusy(true); setListError(null);
    try {
      const next = await examRequest<ExamMaterialIndex>(`/api/exam-material/${subjectId}?page=${page + 1}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setGroups(previous => mergeGroups(previous, next.groups));
      setPage(next.page); setTotal(next.total);
    } catch (error) { if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "تعذر تحميل المجموعات."); }
    finally { if (!controller.signal.aborted) setMoreBusy(false); }
  }

  return <div className={styles.workspace}>
    <div className={styles.banner}><span className={styles.largeIcon}><PlatformIcon name="clipboard" /></span><div><h2>مراجعتك الامتحانية في مكان واحد</h2><p>ملخص أكاديمي، ومراجعة صوتية، وخريطة مفاهيم، واختبار بوضعَي التعلم والتحدي، مع حزمة PDF وأرشيف محفوظ.</p></div><Link href={`/subjects/${subjectId}`} className={styles.back}>العودة إلى المحاضرات <PlatformIcon name="arrow" /></Link></div>
    {initialIndex.canGenerate ? <section className={styles.admin} aria-labelledby="exam-admin-heading">
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>إعداد المحتوى — المدير</span><h2 id="exam-admin-heading">اختيار المحاضرات</h2></div><span className={styles.badge}>{selection.length} محاضرة محددة</span></div>
      <p className={styles.muted}>حدد المحاضرات المطلوبة ثم ولّد المحتوى. تظهر كل مجموعة محاضرات مرة واحدة بأحدث مراجعة، وتُحفظ مراجعاتها السابقة في الأرشيف.</p>
      {initialIndex.lectures.length ? <><fieldset className={styles.lectures} disabled={generating}><legend className={styles.srOnly}>المحاضرات المنشورة</legend>{initialIndex.lectures.map((lecture, index) => <label key={lecture.id} className={styles.lecture} data-selected={selection.includes(lecture.id)}><input type="checkbox" checked={selection.includes(lecture.id)} onChange={event => changeSelection(event.target.checked ? [...selection, lecture.id] : selection.filter(id => id !== lecture.id))} /><span className={styles.lectureNumber}>{lecture.orderIndex > 0 ? lecture.orderIndex : index + 1}</span><span>{lecture.title}</span></label>)}</fieldset>
        <div className={styles.controls}><div><button className={styles.quiet} disabled={generating || initialIndex.lectures.length > 50} onClick={() => changeSelection(initialIndex.lectures.map(l => l.id))}>تحديد الكل</button><button className={styles.quiet} disabled={generating || !selection.length} onClick={() => changeSelection([])}>إلغاء التحديد</button></div><button className={styles.action} disabled={generating || selection.length === 0 || selection.length > 50} onClick={() => void generate()}><PlatformIcon name="clipboard" />{generating ? "جارٍ توليد المحتوى…" : "توليد المحتوى الامتحاني الذكي"}</button></div>
        {selection.length > 50 ? <p role="alert">يمكن اختيار ٥٠ محاضرة كحد أقصى لكل مجموعة.</p> : null}
      </> : <p className={styles.notice}>لا توجد محاضرات منشورة للاختيار بعد.</p>}
      {generationError ? <p className={styles.error} role="alert">{generationError}</p> : null}
      {message ? <p className={styles.success} role="status">{message}</p> : null}
    </section> : null}
    <div className={styles.archiveLayout}>
      <aside className={styles.archive} aria-label="أرشيف المادة الامتحانية"><div className={styles.sectionHead}><h2>المجموعات الامتحانية</h2><span className={styles.badge}>{total}</span></div>
        {groups.length ? <div className={styles.groupList} role="tablist" aria-label="مجموعات المحاضرات">{groups.map(group => <button key={group.id} id={`group-${group.id}`} role="tab" aria-selected={activeGroupId === group.id} aria-controls="exam-group-panel" tabIndex={activeGroupId === group.id ? 0 : -1} className={styles.group} onClick={() => chooseGroup(group.id)} onKeyDown={event => tabKeys(event, groups.map(g => g.id), group.id, chooseGroup)}><span className={styles.groupTitle}><ExamGroupTitle title={group.title} /></span><span className={styles.groupMeta}>{group.lectures.length} محاضرة · {group.questionCount} سؤالًا</span><time dateTime={group.createdAt}>{new Date(group.createdAt).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time></button>)}</div> : <p className={styles.muted}>ستظهر المجموعات هنا بعد توليدها من المدير.</p>}
        {groups.length < total ? <button className={styles.quiet} disabled={moreBusy || generating} onClick={() => void loadMore()}>{moreBusy ? "جارٍ التحميل…" : "عرض مجموعات أقدم"}</button> : null}
        {listError ? <div className={styles.historyError} role="alert"><p>{listError}</p><button className={styles.quiet} disabled={moreBusy || generating} onClick={() => void refreshIndex()}>تحديث قائمة المجموعات</button></div> : null}
        {currentRevision && (currentRevision.revisionCount ?? 1) > 1 ? <ExamMaterialHistory key={currentRevision.id} current={currentRevision} selectedId={groupId} onChoose={chooseGroup} /> : null}
      </aside>
      <section id="exam-group-panel" role="tabpanel" aria-labelledby={activeGroupId ? `group-${activeGroupId}` : undefined} className={styles.content} aria-busy={loading}>
        {loading ? <p className={styles.notice} role="status">جارٍ تحميل المجموعة…</p> : loadError ? <div className={styles.notice} role="alert"><p>{loadError}</p><button className={styles.action} onClick={() => setRetry(v => v + 1)}>إعادة المحاولة</button></div> : selectedDetail ? <>
          <div className={styles.contentHead}><span className={styles.eyebrow}>{historical ? "مراجعة مؤرشفة" : "أحدث مراجعة للمحاضرات"}</span><h2><ExamGroupTitle title={selectedDetail.title} /></h2><p className={styles.muted}>{selectedDetail.lectures.length} محاضرة · {selectedDetail.questionCount} سؤالًا</p>
            {historical && currentRevision ? <div className={styles.historicalNotice}><span>أنت تعرض مراجعة سابقة لهذه المجموعة.</span><button className={styles.quiet} onClick={() => chooseGroup(currentRevision.id)}>عرض أحدث مراجعة</button></div> : null}
            {initialIndex.canGenerate ? <div className={styles.refreshReview}><button className={styles.quiet} disabled={generating || selectedDetail.lectures.some(lecture => !initialIndex.lectures.some(current => current.id === lecture.id))} onClick={() => void generate(selectedDetail.lectures.map(lecture => lecture.id))}><PlatformIcon name="document" />{generating ? "جارٍ إعداد المراجعة…" : "إنشاء مراجعة محدّثة"}</button><span>تُحفظ المراجعة الحالية في الأرشيف.</span></div> : null}</div>
          {initialIndex.canGenerate ? <ExamInstructorGuide key={`instructor-${selectedDetail.id}`} subjectId={subjectId} groupId={selectedDetail.id} /> : null}
          <div className={styles.innerTabs} role="tablist" aria-label="محتوى المجموعة">{contentTabs.map(item => <button key={item.id} id={`exam-${item.id}-tab`} role="tab" aria-selected={tab === item.id} aria-controls={`exam-${item.id}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => chooseTab(item.id)} onKeyDown={event => tabKeys(event, contentTabs.map(tab => tab.id), item.id, id => chooseTab(id as ExamMaterialTab))}><PlatformIcon name={item.icon} />{item.label}</button>)}</div>
          {tab === "summary" ? <ExamAcademicSummary key={selectedDetail.id} summary={selectedDetail.summary} subjectId={subjectId} groupId={selectedDetail.id} chapters={review!.audioChapters} /> : tab === "map" ? <ExamMindMap key={selectedDetail.id} map={review!.mindMap} /> : tab === "package" ? <ExamRevisionPackage key={selectedDetail.id} group={selectedDetail} /> : <div id="exam-quiz-panel" role="tabpanel" aria-labelledby="exam-quiz-tab"><ExamMaterialQuiz key={selectedDetail.id} group={selectedDetail} /></div>}
        </> : <div className={styles.empty}><PlatformIcon name="book" /><h2>لا توجد مجموعة امتحانية بعد</h2><p>{initialIndex.canGenerate ? "اختر المحاضرات أعلاه لبدء إعداد أول مجموعة." : "ستتوفر الملخصات والاختبارات هنا فور نشر مجموعة امتحانية."}</p></div>}
      </section>
    </div>
  </div>;
}
