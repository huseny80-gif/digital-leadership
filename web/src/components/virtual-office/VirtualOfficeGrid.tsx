"use client";

import Link from "next/link";
import { useOptimistic, useTransition, useEffect, useState } from "react";
import type { OfficeEmployee } from "@/app/(app)/admin/virtual-office/page";

function useRelativeTime(iso: string | undefined) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!iso) { setLabel(""); return; }
    function fmt() {
      const diff = Math.floor((Date.now() - new Date(iso!).getTime()) / 1000);
      if (diff < 60) setLabel(`منذ ${diff} ث`);
      else if (diff < 3600) setLabel(`منذ ${Math.floor(diff / 60)} د`);
      else setLabel(`منذ ${Math.floor(diff / 3600)} س`);
    }
    fmt();
    const id = setInterval(fmt, 15_000);
    return () => clearInterval(id);
  }, [iso]);
  return label;
}

const STATUS_META: Record<string, { label: string; icon: string }> = {
  idle:    { label: "متاح",       icon: "🟢" },
  working: { label: "يعمل",       icon: "🟡" },
  meeting: { label: "اجتماع",     icon: "🔵" },
  offline: { label: "غير متصل",  icon: "⚫" },
};

const STATUS_ORDER = ["working", "meeting", "idle", "offline"] as const;

async function updateStatus(id: string, status: string) {
  await fetch("/api/virtual-office/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
}

function EmployeeCard({ emp, onStatusChange }: { emp: OfficeEmployee; onStatusChange: (id: string, status: string) => void }) {
  const meta = STATUS_META[emp.status] ?? STATUS_META.offline;
  const [, startTransition] = useTransition();
  const relTime = useRelativeTime(emp.last_updated);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    startTransition(() => {
      onStatusChange(emp.id, next);
      updateStatus(emp.id, next);
    });
  }

  return (
    <div className={`vo-card vo-card--${emp.status}`}>
      <div className="vo-card-avatar" aria-hidden="true">
        {emp.name.charAt(0)}
      </div>
      <div className="vo-card-body">
        <h3 className="vo-card-name">
          <Link href={`/admin/virtual-office/${emp.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {emp.name}
          </Link>
        </h3>
        <p className="vo-card-role">{emp.role}</p>
        <span className={`vo-status-badge vo-status-badge--${emp.status}`}>
          {meta.icon} {meta.label}
        </span>
        {emp.current_task && (
          <p className="vo-card-task" title={emp.current_task}>
            {emp.current_task}
          </p>
        )}
        {relTime && (
          <p className="vo-card-last-seen">{relTime}</p>
        )}
        <select
          className="vo-status-select"
          value={emp.status}
          onChange={handleChange}
          aria-label={`تغيير حالة ${emp.name}`}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].icon} {STATUS_META[s].label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function VirtualOfficeGrid({ employees }: { employees: OfficeEmployee[] }) {
  const [optimistic, applyOptimistic] = useOptimistic(
    employees,
    (prev, { id, status }: { id: string; status: string }) =>
      prev.map((e) => (e.id === id ? { ...e, status: status as OfficeEmployee["status"] } : e)),
  );

  if (employees.length === 0) {
    return <p className="vo-empty">لا يوجد موظفون محددون في ملف الإعدادات.</p>;
  }

  const sorted = [...optimistic].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status as typeof STATUS_ORDER[number]) - STATUS_ORDER.indexOf(b.status as typeof STATUS_ORDER[number]),
  );

  return (
    <div className="vo-grid">
      {sorted.map((emp) => (
        <EmployeeCard
          key={emp.id}
          emp={emp}
          onStatusChange={(id, status) => applyOptimistic({ id, status })}
        />
      ))}
    </div>
  );
}
