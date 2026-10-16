import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SubjectPdfLibrary } from "@/components/content/SubjectPdfLibrary";
import type { SubjectPdfDocument } from "@/lib/content/subjectPdf";

const source: SubjectPdfDocument = { id: "catalog:source", source: "catalog", fileId: "a".repeat(24), title: "المحاضرة الأولى قانونية", filename: "المحاضرة الأولى قانونية.pdf", sizeBytes: 1024,
  lectureId: "lecture-one", lectureTitle: "المحاضرة الأولى قانونية", order: 1 };
const uploaded: SubjectPdfDocument = { ...source, id: "upload:new", source: "upload", fileId: "new-file", title: "محاضرة الذكاء الاصطناعي", filename: "الذكاء الاصطناعي.pdf", lectureId: "lecture-two", lectureTitle: "محاضرة الذكاء الاصطناعي", order: 2 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("subject PDF folders and files", () => {
  it("shows original downloads, searches Arabic names and opens only the requested preview", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<SubjectPdfLibrary subjectId="course" documents={[source, uploaded]} />);
    expect(document.querySelector("iframe")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getAllByRole("button")).toHaveLength(1);
      expect(within(card).getAllByRole("link")).toHaveLength(2);
      expect(within(card).getByRole("button", { name: "عرض" })).toBeEnabled();
      expect(within(card).getByRole("link", { name: "تحميل" })).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "فتح المحاضرة" })).toBeInTheDocument();
    }
    expect(within(cards[0]!).getByRole("link", { name: "تحميل" })).toHaveAttribute("href", `/api/library/course/${source.fileId}`);
    expect(screen.queryByText(source.filename)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "البحث في ملفات PDF" }), { target: { value: "الاولى" } });
    expect(screen.queryByText(uploaded.filename)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "عرض" }));
    expect(screen.getByTitle(`معاينة ${source.title}`)).toHaveAttribute("src", `/api/library/course/${source.fileId}?inline=1`);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "عرض" })); expect(document.querySelector("iframe")).toBeNull();
  });
  it("requests uploaded-file access only on demand, keeps failures retryable and cancels pending access on unmount", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 403 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: "https://files.example/signed.pdf", expiresAt: "2099-01-01T00:00:00Z" } })));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<SubjectPdfLibrary subjectId="course" documents={[uploaded]} />);
    const downloadUrl = `/api/files/new-file?download=1&filename=${encodeURIComponent(uploaded.filename)}`;
    expect(screen.getByRole("link", { name: "تحميل" })).toHaveAttribute("href", downloadUrl);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "عرض" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("أعد المحاولة");
    fireEvent.click(screen.getByRole("button", { name: "عرض" }));
    await waitFor(() => expect(screen.getByTitle(`معاينة ${uploaded.title}`)).toHaveAttribute("src", "https://files.example/signed.pdf"));
    expect(screen.getByRole("link", { name: "تحميل" })).toHaveAttribute("href", downloadUrl);
    expect(fetcher).toHaveBeenCalledWith("/api/files/new-file", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
    view.unmount();
    fetcher.mockImplementation(() => new Promise(() => {}));
    const next = render(<SubjectPdfLibrary subjectId="course" documents={[uploaded]} />);
    fireEvent.click(screen.getByRole("button", { name: "عرض" }));
    const signal = fetcher.mock.calls.at(-1)![1].signal as AbortSignal;
    next.unmount(); await act(async () => {}); expect(signal.aborted).toBe(true);
  });
});
