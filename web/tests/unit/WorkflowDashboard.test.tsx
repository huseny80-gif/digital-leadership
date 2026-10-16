import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentImport } from "@shared/index";
import { WorkflowDashboard } from "@/components/admin/WorkflowDashboard";

const job: ContentImport = {
  id: "job-1", title: "محاضرة أمن المعلومات", filename: "محاضرة.pdf", uploadPartCount: 1,
  status: "processing", stage: "generating", subjectId: null, subjectTitle: "حوكمة الأمن السيبراني", fileId: null,
  lectures: [], questionCount: 0, generationMethod: null, errorMessage: null,
  createdAt: "2026-10-16T10:00:00Z", updatedAt: "2026-10-16T10:00:00Z",
};
const reply = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); fetchMock.mockImplementation(async () => reply([job])); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("WorkflowDashboard", () => {
  it("uses the protected no-store admin API and displays the actual tasks and routes", async () => {
    render(<WorkflowDashboard />);
    const table = await screen.findByRole("table");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/content-imports", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(within(table).getByText("معالجة نص المحاضرة وإنشاء أسئلة وإجابات مرتبطة بالمصدر.")).toBeInTheDocument();
    expect(within(table).getByText("Classifier → Assessment Generator")).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("progressbar", { name: "إنجاز منسّق معالجة المحتوى" })).toHaveAttribute("value", "50");
    expect(screen.getByText(/ليست وكلاء Claude أو Codex متصلين/)).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "إنشاء الأسئلة" }));
    expect(screen.getByRole("heading", { name: "إنشاء الأسئلة" })).toBeInTheDocument();
  });

  it("isolates demo state and reset from real data, and never sends a mutation", async () => {
    render(<WorkflowDashboard />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "المحاكاة" }));
    expect(screen.getByText(/محاكاة توضيحية فقط/)).toBeInTheDocument();
    for (let step = 0; step < 4; step++) fireEvent.click(screen.getByRole("button", { name: "تقدم المحاكاة" }));
    expect(screen.getByRole("progressbar", { name: "إنجاز المنسّق التجريبي" })).toHaveAttribute("value", "25");
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط المحاكاة" }));
    expect(screen.getByRole("progressbar", { name: "إنجاز المنسّق التجريبي" })).toHaveAttribute("value", "0");
    fireEvent.click(screen.getByRole("button", { name: "الحالة الفعلية" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("progressbar", { name: "إنجاز منسّق معالجة المحتوى" })).toHaveAttribute("value", "50");
    expect(fetchMock.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true);
  });

  it("filters requests by name and status without creating placeholder nodes", async () => {
    fetchMock.mockImplementation(async () => reply([job, { ...job, id: "job-2", title: "محاضرة الثقافة القانونية", status: "completed", stage: "completed" }]));
    render(<WorkflowDashboard />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("combobox", { name: "حالة الطلب" }), { target: { value: "completed" } });
    expect(screen.getByRole("progressbar", { name: "إنجاز منسّق معالجة المحتوى" })).toHaveAttribute("value", "100");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "غير موجود" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "لا توجد طلبات تطابق البحث" })).toBeInTheDocument();
  });

  it("renders unmeasured failed work without invented percentages or raw backend errors", async () => {
    fetchMock.mockImplementation(async () => reply([{ ...job, status: "failed", stage: "failed" }]));
    render(<WorkflowDashboard />);
    const table = await screen.findByRole("table");
    expect(within(table).queryByRole("progressbar", { name: "إنجاز منسّق معالجة المحتوى" })).not.toBeInTheDocument();
    expect(within(table).getAllByText("غير مقاس").length).toBeGreaterThan(0);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "select * secret database" } }), { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "تحديث الحالة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحديث الحالة");
    expect(screen.queryByText(/secret database/)).not.toBeInTheDocument();
  });

  it("clears stale administrative data when the session loses authorization", async () => {
    render(<WorkflowDashboard />);
    await screen.findByRole("table");
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    fireEvent.click(screen.getByRole("button", { name: "تحديث الحالة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("لا تملك صلاحية المدير");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an honest empty state when no real imports are present", async () => {
    fetchMock.mockImplementation(async () => reply([]));
    render(<WorkflowDashboard />);
    expect(await screen.findByRole("heading", { name: "لا توجد طلبات معالجة مسجلة" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/68%/)).not.toBeInTheDocument();
  });

  it("aborts outstanding reads on unmount and does not allow late responses to replace demo state", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    const view = render(<WorkflowDashboard />);
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "المحاكاة" }));
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(reply([job])); });
    expect(screen.getByRole("progressbar", { name: "إنجاز المنسّق التجريبي" })).toHaveAttribute("value", "0");
    expect(screen.queryByRole("progressbar", { name: "إنجاز منسّق معالجة المحتوى" })).not.toBeInTheDocument();
    view.unmount();
  });
});
