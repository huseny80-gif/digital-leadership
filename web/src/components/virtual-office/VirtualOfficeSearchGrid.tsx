"use client";

import { useState } from "react";
import { VirtualOfficeGrid } from "./VirtualOfficeGrid";
import type { OfficeEmployee } from "@/app/(app)/admin/virtual-office/page";

export function VirtualOfficeSearchGrid({ employees }: { employees: OfficeEmployee[] }) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? employees.filter((e) =>
        e.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : employees;

  return (
    <>
      <div className="vo-search-bar">
        <input
          className="vo-search-input"
          type="search"
          placeholder="ابحث عن موظف…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث عن موظف بالاسم"
        />
        {query && (
          <span className="vo-search-count">
            {filtered.length} نتيجة
          </span>
        )}
      </div>
      <VirtualOfficeGrid employees={filtered} />
    </>
  );
}
