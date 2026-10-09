"use client";

import { useEffect, useId, useState } from "react";
import type { ExamMaterialGroup, ExamMaterialHistory as HistoryPage } from "@shared/index";
import { examRequest } from "./request";
import styles from "./examMaterial.module.css";

export function ExamMaterialHistory({ current, selectedId, onChoose }: {
  current: ExamMaterialGroup;
  selectedId: string | null;
  onChoose: (id: string) => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(selectedId !== current.id);
  const [revisions, setRevisions] = useState<ExamMaterialGroup[]>([]);
  const [total, setTotal] = useState((current.revisionCount ?? 1) - 1);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError(null);
      try {
        const result = await examRequest<HistoryPage>(`/api/exam-material/${current.subjectId}/${current.id}/revisions?page=${page}&limit=10`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRevisions(previous => [...new Map([...(page === 1 ? [] : previous), ...result.revisions].map(revision => [revision.id, revision])).values()]);
        setTotal(result.total);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "تعذر تحميل المراجعات السابقة.");
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [open, current.id, current.subjectId, page, retry]);

  return <div className={styles.history}>
    <button className={styles.historyToggle} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>المراجعات السابقة ({total})<span aria-hidden="true">{open ? "−" : "+"}</span></button>
    {open ? <div id={panelId} className={styles.historyPanel} aria-busy={busy}>
      <p className={styles.historyHint}>مراجعات مؤرشفة للمحاضرات نفسها، مع ملخصاتها واختباراتها الأصلية.</p>
      <div className={styles.historyList} aria-label="المراجعات المؤرشفة">{revisions.map(revision => <button key={revision.id} className={styles.revision} aria-pressed={selectedId === revision.id} onClick={() => onChoose(revision.id)}>
        <span>مراجعة محفوظة</span><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString("ar", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}</time><span className={styles.groupMeta}>{revision.questionCount} سؤالًا</span>
      </button>)}</div>
      {error ? <div className={styles.historyError} role="alert"><p>{error}</p><button className={styles.quiet} onClick={() => setRetry(value => value + 1)}>إعادة تحميل المراجعات</button></div> : busy ? <p className={styles.historyHint} role="status">جارٍ تحميل المراجعات…</p> : revisions.length < total ? <button className={styles.quiet} onClick={() => setPage(value => value + 1)}>عرض مراجعات أقدم</button> : null}
    </div> : null}
  </div>;
}
