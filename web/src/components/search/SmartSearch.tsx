"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type {
  ContentSearchResponse,
  ContentSearchResult,
  SearchContentKind,
} from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { HighlightedText } from "./HighlightedText";

const categories: Array<{
  kind: SearchContentKind;
  label: string;
  icon: string;
}> = [
  { kind: "lecture", label: "محاضرات", icon: "video" },
  { kind: "summary", label: "ملخصات", icon: "document" },
  { kind: "quiz", label: "اختبارات", icon: "quiz" },
  { kind: "file", label: "ملفات ومراجع", icon: "folder" },
];

export function SmartSearch() {
  const id = useId();
  const root = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [response, setResponse] = useState<ContentSearchResponse | null>(null);
  const [active, setActive] = useState(-1);
  const sequence = useRef(0);
  const q = query.trim();
  const results = response?.query === q ? response.results : [];
  const ordered = categories.flatMap((category) =>
    results.filter((item) => item.kind === category.kind),
  );
  const expanded = open && q.length >= 2;

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const requestId = sequence.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = (await result.json()) as { data?: ContentSearchResponse };
        if (!result.ok || !body.data) throw new Error("search_unavailable");
        if (controller.signal.aborted || requestId !== sequence.current) return;
        setResponse(body.data);
        setError(false);
      } catch {
        if (controller.signal.aborted || requestId !== sequence.current) return;
        setError(true);
      } finally {
        if (!controller.signal.aborted && requestId === sequence.current)
          setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!ordered.length) return;
      const next =
        event.key === "ArrowDown"
          ? (active + 1) % ordered.length
          : active <= 0
            ? ordered.length - 1
            : active - 1;
      setActive(next);
      root.current
        ?.querySelector(`[id="${id}-result-${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && expanded && active >= 0 && ordered[active]) {
      event.preventDefault();
      window.location.assign(ordered[active].href);
    }
  }
  function resultOption(item: ContentSearchResult) {
    const index = ordered.indexOf(item);
    return (
      <a
        href={item.href}
        key={item.id}
        id={`${id}-result-${index}`}
        role="option"
        aria-selected={active === index}
        tabIndex={-1}
        className="dl-search-result"
        onMouseEnter={() => setActive(index)}
        onClick={() => setOpen(false)}
      >
        <PlatformIcon
          name={
            categories.find((category) => category.kind === item.kind)!.icon
          }
        />
        <span>
          <strong>
            <HighlightedText text={item.title} query={q} />
          </strong>
          <small>
            <HighlightedText text={item.subjectTitle} query={q} />
          </small>
        </span>
        <PlatformIcon name="arrow" />
      </a>
    );
  }

  return (
    <form
      ref={root}
      action="/subjects"
      className="dl-header-search"
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input type="hidden" name="view" value="search" />
      <button type="submit" aria-label="بحث">
        <PlatformIcon name="search" />
      </button>
      <input
        name="q"
        type="search"
        role="combobox"
        aria-label="البحث في المحاضرات والملفات والاختبارات"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-results`}
        aria-activedescendant={
          expanded && active >= 0 && ordered[active]
            ? `${id}-result-${active}`
            : undefined
        }
        placeholder="البحث في المحاضرات والملفات والاختبارات ..."
        autoComplete="off"
        maxLength={120}
        value={query}
        onKeyDown={keydown}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          sequence.current++;
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
          setError(false);
          setLoading(event.target.value.trim().length >= 2);
        }}
      />
      {expanded ? (
        <div className="dl-search-dropdown">
          <p className="dl-search-status" role="status">
            {loading
              ? "جارٍ البحث…"
              : error
                ? "تعذر البحث. حاول مجددًا أو اعرض جميع النتائج."
                : ordered.length
                  ? `${ordered.length.toLocaleString("ar")} نتيجة`
                  : "لا توجد نتائج مطابقة."}
          </p>
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label="نتائج البحث"
            aria-busy={loading}
          >
            {!loading && !error
              ? categories.map((category) => {
                  const items = results.filter(
                    (item) => item.kind === category.kind,
                  );
                  return items.length ? (
                    <div
                      role="group"
                      aria-label={category.label}
                      className="dl-search-group"
                      key={category.kind}
                    >
                      <p aria-hidden="true">{category.label}</p>
                      {items.map(resultOption)}
                    </div>
                  ) : null;
                })
              : null}
          </div>
          <a
            className="dl-search-all"
            href={`/subjects?view=search&q=${encodeURIComponent(q)}`}
          >
            عرض جميع النتائج <PlatformIcon name="arrow" />
          </a>
        </div>
      ) : null}
    </form>
  );
}
