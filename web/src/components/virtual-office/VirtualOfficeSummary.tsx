"use client";

import type { OfficeEmployee } from "@/app/(app)/admin/virtual-office/page";

const STATUS_LABELS: Record<string, string> = {
  idle: "متاح",
  working: "يعمل",
  meeting: "اجتماع",
  offline: "غير متصل",
};

export function VirtualOfficeSummary({ employees }: { employees: OfficeEmployee[] }) {
  const counts: Record<string, number> = { idle: 0, working: 0, meeting: 0, offline: 0 };
  for (const emp of employees) counts[emp.status] = (counts[emp.status] ?? 0) + 1;

  return (
    <div className="vo-summary-chips">
      {(["working", "meeting", "idle", "offline"] as const).map((s) => (
        <span key={s} className={`vo-chip vo-chip--${s}`}>
          {counts[s] ?? 0} {STATUS_LABELS[s]}
        </span>
      ))}
    </div>
  );
}
