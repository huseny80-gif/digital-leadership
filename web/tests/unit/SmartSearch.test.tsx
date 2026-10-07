import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SmartSearch } from "@/components/search/SmartSearch";
import {
  HighlightedText,
  highlightRanges,
} from "@/components/search/HighlightedText";
import type { ContentSearchResult } from "@shared/index";

const results: ContentSearchResult[] = [
  {
    id: "lecture",
    kind: "lecture",
    title: "مقدمة في الذكاء الاصطناعي",
    subjectTitle: "الذكاء الاصطناعي وتحليل البيانات",
    href: "/subjects/course/lectures/lecture",
  },
  {
    id: "quiz",
    kind: "quiz",
    title: "اختبار الذكاء الاصطناعي",
    subjectTitle: "الذكاء الاصطناعي",
    href: "/quizzes/quiz",
  },
];
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const reply = (query: string, items = results) => ({
  ok: true,
  json: async () => ({ data: { query, results: items } }),
});
const search = () =>
  screen.getByRole("combobox", {
    name: "البحث في المحاضرات والملفات والاختبارات",
  });

describe("contextual live search", () => {
  it("debounces typing and displays categorized, highlighted links with keyboard selection", async () => {
    vi.mocked(fetch).mockResolvedValue(reply("ذكاء") as Response);
    render(<SmartSearch />);
    fireEvent.change(search(), { target: { value: "ذ" } });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(search(), { target: { value: "ذكاء" } });
    await screen.findByRole("group", { name: "محاضرات" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("group", { name: "اختبارات" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "href",
      results[0].href,
    );
    expect(document.querySelectorAll("mark").length).toBeGreaterThanOrEqual(2);
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(search()).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[0].id,
    );
    fireEvent.keyDown(search(), { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(search(), { key: "Escape" });
    expect(search()).toHaveAttribute("aria-expanded", "false");
  });

  it("ignores stale responses when a newer query completes first", async () => {
    let firstResolve: (response: Response) => void = () => {};
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            firstResolve = resolve;
          }),
      )
      .mockResolvedValueOnce(
        reply("بيانات", [
          { ...results[0], title: "تحليل البيانات" },
        ]) as Response,
      );
    render(<SmartSearch />);
    fireEvent.change(search(), { target: { value: "ذكاء" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(search(), { target: { value: "بيانات" } });
    await screen.findByRole("option", { name: /تحليل البيانات/ });
    await act(async () => {
      firstResolve(reply("ذكاء") as Response);
    });
    expect(
      screen.getByRole("option", { name: /تحليل البيانات/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /مقدمة في الذكاء/ }),
    ).not.toBeInTheDocument();
  });

  it("offers full search on failure and closes on an outside pointer", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    render(<SmartSearch />);
    fireEvent.change(search(), { target: { value: "ذكاء" } });
    await screen.findByText("تعذر البحث. حاول مجددًا أو اعرض جميع النتائج.");
    expect(
      screen.getByRole("link", { name: "عرض جميع النتائج" }),
    ).toHaveAttribute(
      "href",
      "/subjects?view=search&q=%D8%B0%D9%83%D8%A7%D8%A1",
    );
    fireEvent.pointerDown(document.body);
    expect(search()).toHaveAttribute("aria-expanded", "false");
  });

  it("highlights Arabic variants and ligatures while preserving original text and escaping markup", () => {
    expect(highlightRanges("إدارة المخاطر", "ادارة")).toEqual([[0, 5]]);
    expect(highlightRanges("ﻻ", "لا")).toEqual([[0, 1]]);
    const text = "الذَّكاءُ <img src=x onerror=alert(1)>";
    const { container } = render(
      <HighlightedText text={text} query="ذكاء img" />,
    );
    expect(container.textContent).toBe(text);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("mark")).toHaveLength(2);
  });
});
