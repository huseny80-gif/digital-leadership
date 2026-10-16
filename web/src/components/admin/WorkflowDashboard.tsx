"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContentImport } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { advanceSimulation, importWorkflow, IMPORT_STATUSES, isContentImportList, simulationWorkflow,
  workflowStats, WORKFLOW_STATES, WORKFLOW_TIERS, type SimulationProgress, type WorkflowNode } from "@/lib/workflowDashboard";
import styles from "./workflowDashboard.module.css";

const POLL_MS = 15_000;
const EMPTY_SIMULATION: SimulationProgress = [0, 0, 0, 0];

function Progress({ node }: { node: WorkflowNode }) {
  return <div className={styles.progressCell}>
    {node.progress === null ? <span className={styles.unmeasured}>غير مقاس</span> : <>
      <progress aria-label={`إنجاز ${node.name}`} max={100} value={node.progress} />
      <b dir="ltr">{node.progress}%</b>
    </>}
  </div>;
}

export function WorkflowDashboard() {
  const [mode, setMode] = useState<"actual" | "simulation">("actual");
  const [jobs, setJobs] = useState<ContentImport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("master");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [simulation, setSimulation] = useState<SimulationProgress>(EMPTY_SIMULATION);

  useEffect(() => {
    if (mode !== "actual") return;
    let disposed = false;
    let pending = false;
    let controller: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (pending || disposed) return;
      pending = true;
      setBusy(true);
      controller = new AbortController();
      timeout = setTimeout(() => controller?.abort(), 12_000);
      try {
        const response = await fetch("/api/admin/content-imports", { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if ((response.status === 401 || response.status === 403) && !disposed) {
            setJobs([]);
            setCheckedAt(null);
            setLoaded(false);
          }
          throw new Error(response.status === 401 || response.status === 403 ? "انتهت الجلسة أو لا تملك صلاحية المدير. سجّل الدخول مجددًا." : "تعذر تحديث الحالة. البيانات السابقة، إن وجدت، معروضة بوقت آخر تحقق ناجح.");
        }
        const body: unknown = await response.json();
        const data = body && typeof body === "object" && "data" in body ? body.data : undefined;
        if (!isContentImportList(data)) throw new Error("وصلت بيانات متابعة غير صالحة. أعد التحديث.");
        if (!disposed) {
          setJobs(data);
          setLoaded(true);
          setCheckedAt(new Date().toISOString());
          setError(null);
        }
      } catch (failure) {
        if (!disposed) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "تعذر الاتصال بالخادم. أعد تحديث الحالة.");
      } finally {
        clearTimeout(timeout);
        pending = false;
        if (!disposed) setBusy(false);
      }
    }
    void load();
    const interval = setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, POLL_MS);
    return () => { disposed = true; clearInterval(interval); clearTimeout(timeout); controller?.abort(); };
  }, [mode, refresh]);

  const query = search.trim().toLocaleLowerCase("ar");
  const filtered = jobs.filter(job => (filter === "all" || job.status === filter)
    && `${job.title} ${job.subjectTitle ?? ""}`.toLocaleLowerCase("ar").includes(query));
  const selectedJob = filtered.find(job => job.id === selectedJobId) ?? filtered[0] ?? null;
  const nodes = mode === "simulation" ? simulationWorkflow(simulation) : selectedJob ? importWorkflow(selectedJob) : [];
  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? nodes[1] ?? null;
  const stats = workflowStats(nodes);
  const cards = [
    { tier: "client", label: mode === "actual" ? "الطلبات في المسار المحدد" : "العملاء التجريبيون", value: stats.clients, icon: "users" },
    { tier: "master", label: mode === "actual" ? "مسار التنسيق الداخلي" : "المنسّقون التجريبيون", value: stats.masters, icon: "network" },
    { tier: "specialist", label: mode === "actual" ? "مراحل المعالجة المتخصصة" : "الوكلاء التجريبيون", value: stats.specialists, icon: "settings" },
    { tier: "integration", label: "إنجاز المسار المحدد", value: stats.progress === null ? "—" : `${stats.progress}%`, icon: "chart" },
  ];

  return <section className={styles.dashboard} dir="rtl" aria-labelledby="workflow-title">
    <header className={`${styles.panel} ${styles.header}`}>
      <div className={styles.titleGroup}>
        <span className={styles.eyebrow}><PlatformIcon name="network" /> مركز العمليات · منصة القيادة الرقمية</span>
        <h1 id="workflow-title">مسارات الوكلاء والمهام</h1>
        <p>عرض منظم للطلبات، وأدوار المعالجة، ومسارات انتقال البيانات حتى اكتمال المخرجات.</p>
      </div>
      <div className={styles.headerActions}>
        <span className={styles.modeBadge} data-demo={mode === "simulation"}>
          <span className={styles.dot} />{mode === "actual" ? "بيانات المنصة" : "محاكاة تجريبية"}
        </span>
        {mode === "actual" ? <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => setRefresh(value => value + 1)}>
          <PlatformIcon name="clock" />{busy ? "جارٍ التحديث…" : "تحديث الحالة"}
        </button> : <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} disabled={stats.progress === 100} onClick={() => setSimulation(advanceSimulation)}><PlatformIcon name="play" />تقدم المحاكاة</button>
          <button type="button" className={styles.secondaryButton} onClick={() => setSimulation(EMPTY_SIMULATION)}>إعادة ضبط المحاكاة</button>
        </div>}
      </div>
    </header>

    <div className={styles.toolbar}>
      <div className={styles.modeSwitch} role="group" aria-label="مصدر بيانات اللوحة">
        <button type="button" aria-pressed={mode === "actual"} onClick={() => setMode("actual")}>الحالة الفعلية</button>
        <button type="button" aria-pressed={mode === "simulation"} onClick={() => setMode("simulation")}>المحاكاة</button>
      </div>
      <p className={styles.timestamp} role="status">{mode === "simulation" ? "مثال محلي مستقل عن مهام المنصة" : checkedAt
        ? <>آخر تحقق ناجح: <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleTimeString("ar-IQ")}</time> · تحديث كل 15 ثانية</>
        : busy ? "جارٍ تحميل سجل المعالجة…" : "لم تصل بيانات متابعة بعد"}</p>
    </div>

    <div className={styles.notice} data-demo={mode === "simulation"}>
      <PlatformIcon name="info" />
      <p>{mode === "actual" ? "تُقرأ الحالات من سجل معالجة المحاضرات. الأدوار مراحل داخلية، وليست وكلاء Claude أو Codex متصلين. النسبة تحسب المراحل المكتملة من أربع مراحل، ولا تقدّر الوقت المتبقي."
        : "محاكاة توضيحية فقط: تتقدم الأدوار بالتسلسل دون استدعاء Claude أو Codex، ودون تغيير المحتوى أو تشغيل مهام حقيقية."}</p>
    </div>
    {mode === "actual" && error ? <div className={styles.error} role="alert">{error}</div> : null}

    <div className={styles.stats}>
      {cards.map(card => <article key={card.tier} className={`${styles.panel} ${styles.stat}`} data-tier={card.tier}>
        <div><p>{card.label}</p><strong dir="ltr">{card.value}</strong></div>
        <span className={styles.statIcon}><PlatformIcon name={card.icon} /></span>
      </article>)}
    </div>

    {mode === "actual" && loaded ? <div className={`${styles.panel} ${styles.filters}`}>
      <label><span>ابحث عن طلب أو مادة</span><input type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder="اسم المحاضرة أو المادة…" /></label>
      <label><span>حالة الطلب</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">جميع الحالات</option>
        {Object.entries(IMPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className={styles.jobPicker}><span>المسار المعروض · {filtered.length} من آخر {jobs.length} طلبًا</span>
        <select value={selectedJob?.id ?? ""} onChange={event => setSelectedJobId(event.target.value)} disabled={!filtered.length}>
          {!filtered.length ? <option value="">لا توجد طلبات مطابقة</option> : filtered.map(job => <option key={job.id} value={job.id}>{job.title} · {IMPORT_STATUSES[job.status]} · {job.id.slice(0, 8)}</option>)}
        </select>
      </label>
    </div> : null}

    {nodes.length ? <>
      <div className={styles.contentGrid}>
        <section className={`${styles.panel} ${styles.matrix}`} aria-labelledby="workflow-matrix-title">
          <div className={styles.sectionHeading}><h2 id="workflow-matrix-title"><PlatformIcon name="clipboard" />مصفوفة المسارات والمهام</h2><span>{nodes.length} عُقد</span></div>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="جدول المسارات قابل للتمرير أفقيًا">
            <table>
              <caption className={styles.srOnly}>الكيانات وأدوارها ومساراتها ومهامها ونسب الإنجاز؛ اختر الكيان لعرض تفاصيله.</caption>
              <thead><tr><th scope="col">الكيان</th><th scope="col">الفئة</th><th scope="col">مسار التدفق</th><th scope="col">المهمة المسندة</th><th scope="col">الإنجاز</th></tr></thead>
              <tbody>{nodes.map(node => <tr key={node.id} data-tier={node.tier} data-selected={selectedNode?.id === node.id}>
                <th scope="row"><button type="button" className={styles.nodeButton} aria-pressed={selectedNode?.id === node.id} onClick={() => setSelectedNodeId(node.id)}><span className={styles.dot} />{node.name}</button></th>
                <td><span className={styles.tierBadge}>{WORKFLOW_TIERS[node.tier].label}</span></td>
                <td><bdi className={styles.path} dir="ltr">{node.path}</bdi></td>
                <td className={styles.task}>{node.task}</td>
                <td><Progress node={node} /><span className={styles.state} data-state={node.state}>{WORKFLOW_STATES[node.state]}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <aside className={`${styles.panel} ${styles.flow}`} aria-labelledby="workflow-flow-title">
          <div className={styles.sectionHeading}><h2 id="workflow-flow-title"><PlatformIcon name="network" />شجرة المسار</h2></div>
          <ol>{nodes.map(node => <li key={node.id} data-tier={node.tier}>
            <button type="button" aria-pressed={selectedNode?.id === node.id} onClick={() => setSelectedNodeId(node.id)}>
              <span className={styles.flowIcon}><PlatformIcon name={WORKFLOW_TIERS[node.tier].icon} /></span>
              <span><strong>{node.name}</strong><small>{WORKFLOW_STATES[node.state]}</small></span>
              <b>{node.progress === null ? "—" : `${node.progress}%`}</b>
            </button>
            <span className={styles.flowArrow} aria-hidden="true">↓</span>
          </li>)}</ol>
          <p className={styles.flowFootnote}>{mode === "actual" ? "مسار معالجة واحد للطلب المحدد؛ عدد الطلبات لا يمثل عدد المتدربين أو الوكلاء المتصلين." : "مثال بحث ← برمجة ← جودة ← تسليم. جميع الأسماء والأدوار هنا تجريبية."}</p>
        </aside>
      </div>

      {selectedNode ? <section className={`${styles.panel} ${styles.detail}`} data-tier={selectedNode.tier} aria-labelledby="workflow-detail-title">
        <span className={styles.detailIcon}><PlatformIcon name={WORKFLOW_TIERS[selectedNode.tier].icon} /></span>
        <div><span className={styles.eyebrow}>تفاصيل العقدة المحددة</span><h2 id="workflow-detail-title">{selectedNode.name}</h2><p>{selectedNode.task}</p>
          <p className={styles.detailMeta}>المصدر: {selectedNode.parent ? nodes.find(node => node.id === selectedNode.parent)?.name : "طلب المدير"} · الحالة: {WORKFLOW_STATES[selectedNode.state]}</p>
          {mode === "actual" && selectedJob ? <p className={styles.detailMeta}>المادة: {selectedJob.subjectTitle || "لم تُحدّد بعد"} · آخر تغيير في الطلب: <time dateTime={selectedJob.updatedAt}>{new Date(selectedJob.updatedAt).toLocaleString("ar-IQ")}</time></p> : null}
        </div>
        <Link href="/admin/content" className={styles.secondaryButton}>إدارة محتوى المحاضرات<PlatformIcon name="arrow" /></Link>
      </section> : null}
    </> : <div className={`${styles.panel} ${styles.empty}`}>
      <PlatformIcon name="network" /><h2>{busy && !loaded ? "جارٍ تحميل مسارات المعالجة" : !loaded ? "بيانات المتابعة غير متاحة" : jobs.length ? "لا توجد طلبات تطابق البحث" : "لا توجد طلبات معالجة مسجلة"}</h2>
      <p>{loaded ? "يمكنك متابعة طلبات إضافة المحاضرات هنا، أو استعراض النموذج من زر المحاكاة." : "استخدم تحديث الحالة لإعادة الاتصال بسجل المعالجة."}</p>
      <Link className={styles.secondaryButton} href="/admin/content">إضافة محتوى دراسي</Link>
    </div>}

    <footer className={styles.legend} aria-label="دليل ألوان الكيانات">
      {Object.entries(WORKFLOW_TIERS).map(([tier, item]) => <span key={tier} data-tier={tier}><i className={styles.dot} />{item.label} · {item.color}</span>)}
    </footer>
  </section>;
}
