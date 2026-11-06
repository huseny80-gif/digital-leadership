"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

const FILTERS = [
  { value: "",         label: "الكل" },
  { value: "working",  label: "يعمل" },
  { value: "meeting",  label: "اجتماع" },
  { value: "idle",     label: "متاح" },
  { value: "offline",  label: "غير متصل" },
] as const;

export function VirtualOfficeFilter({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("status") ?? "";
  const [, startTransition] = useTransition();

  function select(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("status", value);
    else next.delete("status");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="vo-filter-bar" role="group" aria-label="فلترة الموظفين حسب الحالة">
      {FILTERS.map(({ value, label }) => {
        const count = value ? (counts[value] ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0);
        const active = current === value;
        return (
          <button
            key={value}
            className={`vo-filter-chip vo-filter-chip--${value || "all"}${active ? " vo-filter-chip--active" : ""}`}
            onClick={() => select(value)}
            aria-pressed={active}
          >
            {label}
            <span className="vo-filter-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
