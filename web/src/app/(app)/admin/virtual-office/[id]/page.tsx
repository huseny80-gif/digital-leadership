import Link from "next/link";
import type { OfficeEmployee, OfficeState } from "../page";

export const dynamic = "force-dynamic";

interface TaskEntry {
  filename: string;
  task_id: string;
  timestamp: string;
  content: string;
}

async function fetchEmployee(id: string): Promise<OfficeEmployee | null> {
  const baseUrl = process.env.OFFICE_STATE_URL ?? "http://localhost:5050/api/state";
  try {
    const res = await fetch(`${baseUrl}/${id}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return (await res.json()) as OfficeEmployee;
  } catch { return null; }
}

async function fetchTasks(id: string): Promise<TaskEntry[]> {
  const baseUrl = process.env.OFFICE_STATE_URL ?? "http://localhost:5050/api/state";
  const tasksUrl = baseUrl.replace(/\/api\/state\/?$/, `/api/tasks/${id}`);
  try {
    const res = await fetch(tasksUrl, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.tasks ?? [];
  } catch { return []; }
}

function formatTs(raw: string): string {
  // raw: YYYYMMDD_HHMMSS
  if (!raw || raw.length < 15) return raw;
  const d = raw.slice(0, 8);
  const t = raw.slice(9, 15);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  idle:    { label: "متاح",      color: "#22c55e" },
  working: { label: "يعمل",      color: "#f59e0b" },
  meeting: { label: "اجتماع",    color: "#3b82f6" },
  offline: { label: "غير متصل", color: "#64748b" },
};

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [emp, tasks] = await Promise.all([
    fetchEmployee(id),
    fetchTasks(id),
  ]);

  const meta = emp ? (STATUS_META[emp.status] ?? STATUS_META.offline) : null;

  return (
    <div className="vo-page" dir="rtl" style={{ padding: "0 0 48px" }}>
      {/* Header */}
      <header className="vo-header" style={{ gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/admin/virtual-office" className="vo-back-link">← العودة</Link>
          <h1 className="vo-title" style={{ margin: 0 }}>
            {emp ? emp.name : params.id}
          </h1>
          {emp && meta && (
            <span className={`vo-status-badge vo-status-badge--${emp.status}`}>
              {meta.label}
            </span>
          )}
        </div>
        {emp && <p className="vo-last-updated">{emp.role}</p>}
      </header>

      {!emp && (
        <div className="vo-offline-banner">
          <span className="vo-offline-icon">⚠️</span>
          <p>تعذّر الاتصال بخادم المكتب، أو الموظف غير موجود.</p>
        </div>
      )}

      {/* Task history */}
      <section style={{ padding: "24px max(16px, env(safe-area-inset-right, 0px)) 0 max(16px, env(safe-area-inset-left, 0px))" }}>
        <h2 className="vo-section-title">سجل المهام ({tasks.length})</h2>

        {tasks.length === 0 && (
          <p className="vo-empty">لا توجد مهام مسجّلة لهذا الموظف.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {tasks.map((t) => (
            <div key={t.filename} className="vo-task-card">
              <div className="vo-task-card-header">
                <span className="vo-task-id">{t.task_id}</span>
                <span className="vo-task-ts">{formatTs(t.timestamp)}</span>
              </div>
              <pre className="vo-task-content">{t.content}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
