"use client";

import type { OfficeEmployee } from "@/app/(app)/admin/virtual-office/page";

const STATUS_META: Record<string, { label: string; icon: string }> = {
  idle:    { label: "متاح",        icon: "🟢" },
  working: { label: "يعمل",        icon: "🟡" },
  meeting: { label: "اجتماع",      icon: "🔵" },
  offline: { label: "غير متصل",   icon: "⚫" },
};

function EmployeeCard({ emp }: { emp: OfficeEmployee }) {
  const meta = STATUS_META[emp.status] ?? STATUS_META.offline;
  return (
    <div className={`vo-card vo-card--${emp.status}`}>
      <div className="vo-card-avatar" aria-hidden="true">
        {emp.name.charAt(0)}
      </div>
      <div className="vo-card-body">
        <h3 className="vo-card-name">{emp.name}</h3>
        <p className="vo-card-role">{emp.role}</p>
        <span className={`vo-status-badge vo-status-badge--${emp.status}`}>
          {meta.icon} {meta.label}
        </span>
        {emp.current_task && (
          <p className="vo-card-task" title={emp.current_task}>
            {emp.current_task}
          </p>
        )}
      </div>
    </div>
  );
}

export function VirtualOfficeGrid({ employees }: { employees: OfficeEmployee[] }) {
  if (employees.length === 0) {
    return (
      <p className="vo-empty">لا يوجد موظفون محددون في ملف الإعدادات.</p>
    );
  }

  const order = ["working", "meeting", "idle", "offline"];
  const sorted = [...employees].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status)
  );

  return (
    <div className="vo-grid">
      {sorted.map((emp) => (
        <EmployeeCard key={emp.id} emp={emp} />
      ))}
    </div>
  );
}
