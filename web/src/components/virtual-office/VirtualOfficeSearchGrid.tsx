"use client";

import { useState, useEffect, useRef } from "react";
import { VirtualOfficeGrid } from "./VirtualOfficeGrid";
import type { OfficeEmployee } from "@/app/(app)/admin/virtual-office/page";

export function VirtualOfficeSearchGrid({ employees }: { employees: OfficeEmployee[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && e.target === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filtered = query.trim()
    ? employees.filter((e) =>
        e.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : employees;

  return (
    <>
      <div className="vo-search-bar">
        <input
          ref={inputRef}
          className="vo-search-input"
          type="search"
          placeholder="ابحث عن موظف… ( / )"
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
