import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContentImport } from "@shared/index";
import { SmartContentUpload } from "@/components/admin/SmartContentUpload";

const request = vi.fn<typeof fetch>();
const limits = { maxPdfBytes: 10 * 1024 * 1024, partBytes: 2 * 1024 * 1024, maxTextCharacters: 500000 };
const job: ContentImport = { id: "123e4567-e89b-42d3-a456-426614174000", title: "المحاضرة الخامسة", filename: null, uploadPartCount: 0, status: "queued", stage: "queued", subjectId: null, subjectTitle: null, fileId: null, lectures: [], questionCount: 0, generationMethod: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const text = "تتضمن إدارة المخاطر تحديد الأحداث المحتملة وتحليل الاحتمالية والأثر قبل اختيار خطة الاستجابة المناسبة لحماية أهداف المؤسسة. تساعد مصفوفة المخاطر على ترتيب الأولويات وتوجيه الموارد نحو المخاطر ذات التأثير المرتفع بصورة منتظمة داخل المؤسسة.";
const json = (data: unknown) => Response.json({ data });
beforeEach(() => {
  request.mockReset(); vi.stubGlobal("fetch", request);
  request.mockImplementation(async path => String(path).endsWith("/limits") ? json(limits) : json([]));
});
afterEach(() => { vi.unstubAllGlobals(); });
async function ready() { render(<SmartContentUpload />); await waitFor(() => expect(screen.getByRole("button", { name: "إضافة وتحديث الاختبارات تلقائيًا" })).toBeEnabled()); }

describe("automatic content upload", () => {
  it("accepts content without asking the administrator to choose a course or lecture", async () => {
    await ready();
    expect(screen.getByLabelText("المحاضرات والملفات الجديدة")).toHaveAttribute("multiple");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "نص محاضرة" }));
    fireEvent.change(screen.getByLabelText("عنوان المحاضرة (اختياري)"), { target: { value: "المحاضرة الخامسة" } });
    fireEvent.change(screen.getByLabelText("نص المحاضرة"), { target: { value: text } });
    request.mockImplementation(async (path, init) => init?.method === "POST" ? json(job) : String(path).endsWith("/limits") ? json(limits) : json([]));
    fireEvent.click(screen.getByRole("button", { name: "إضافة وتحديث الاختبارات تلقائيًا" }));
    await screen.findByText("بانتظار المعالجة");
    const submission = request.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(submission[1]!.body))).toEqual({ text, title: "المحاضرة الخامسة" });
    expect(screen.queryByText("اكتمل التحديث")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("في الخلفية");
  });
  it("shows the actual course, per-lecture questions, tests and preserved original after completion", async () => {
    request.mockImplementation(async path => String(path).endsWith("/limits") ? json(limits) : json([{ ...job, filename: "محاضرة.pdf", status: "completed", stage: "completed", subjectId: "risk", subjectTitle: "إدارة المخاطر", questionCount: 7, lectures: [{ id: "lecture-5", title: "المحاضرة الخامسة", number: 5, questionCount: 7, quizId: "quiz-5" }] }]));
    await ready();
    expect(screen.getByText("إدارة المخاطر")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "المحاضرة الخامسة" })).toHaveAttribute("href", "/subjects/risk/lectures/lecture-5");
    expect(screen.getByRole("link", { name: "اختبار المحاضرة" })).toHaveAttribute("href", "/quizzes/quiz-5");
    expect(screen.getByRole("link", { name: "تنزيل الملف الأصلي" })).toHaveAttribute("href", `/api/admin/content-source/${job.id}`);
    expect(screen.getByText(/مع 7 سؤالًا/)).toBeInTheDocument();
  });
  it("retries a failed import with its saved source", async () => {
    request.mockImplementation(async (path, init) => init?.method === "POST" ? json(job) : String(path).endsWith("/limits") ? json(limits) : json([{ ...job, status: "failed", stage: "failed", errorMessage: "الملف محفوظ" }]));
    await ready(); fireEvent.click(screen.getByRole("button", { name: "إعادة المعالجة" }));
    await screen.findByText("بانتظار المعالجة");
    expect(request).toHaveBeenCalledWith(`/api/admin/content-imports/${job.id}/retry`, expect.objectContaining({ method: "POST", body: "{}" }));
    expect(screen.queryByRole("button", { name: "إعادة المعالجة" })).not.toBeInTheDocument();
  });
  it("uploads bounded parts in order and queues processing only after the final part", async () => {
    await ready();
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) } });
    const bytes = new Uint8Array(limits.partBytes + 80); const file = new File([bytes], "RiskManagement5.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    request.mockImplementation(async (path, init) => {
      if (String(path).endsWith("/uploads")) return json({ ...job, filename: file.name, status: "uploading", stage: "uploading", uploadPartCount: 2 });
      if (init?.method === "PUT") return new Response(null, { status: 204 });
      if (String(path).endsWith("/complete")) return json({ ...job, filename: file.name });
      return json([]);
    });
    fireEvent.change(screen.getByLabelText("المحاضرات والملفات الجديدة"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة وتحديث الاختبارات تلقائيًا" }));
    await screen.findByText("بانتظار المعالجة");
    const mutations = request.mock.calls.filter(([, init]) => init?.method);
    expect(mutations.map(([path]) => path)).toEqual(["/api/admin/content-imports/uploads", `/api/admin/content-upload/${job.id}/0`, `/api/admin/content-upload/${job.id}/1`, `/api/admin/content-imports/${job.id}/complete`]);
    expect(mutations.filter(([, init]) => init?.method === "PUT").map(([, init]) => (init!.body as Blob).size)).toEqual([limits.partBytes, 80]);
  });
  it("keeps an interrupted upload resumable and never queues an incomplete PDF", async () => {
    await ready();
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) } });
    const bytes = new Uint8Array(40); const file = new File([bytes], "RiskManagement5.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    request.mockImplementation(async (path, init) => init?.method === "PUT" ? new Response(null, { status: 503 }) : String(path).endsWith("/uploads") ? json({ ...job, filename: file.name, status: "uploading", stage: "uploading", uploadPartCount: 1 }) : json([]));
    fireEvent.change(screen.getByLabelText("المحاضرات والملفات الجديدة"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة وتحديث الاختبارات تلقائيًا" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("الأجزاء المرفوعة محفوظة");
    expect(request.mock.calls.some(([path]) => String(path).endsWith("/complete"))).toBe(false);
    expect(screen.getByRole("button", { name: "إضافة وتحديث الاختبارات تلقائيًا" })).toBeEnabled();
  });
});
