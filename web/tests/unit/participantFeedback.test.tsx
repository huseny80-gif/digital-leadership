import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PaginatedResult, ParticipantFeedback } from "@shared/index";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import FeedbackPage from "@/app/(app)/feedback/page";
import { ParticipantFeedbackInbox } from "@/components/feedback/ParticipantFeedbackInbox";

const mockFetch = vi.fn<typeof fetch>();
beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal("fetch", mockFetch); });
afterEach(() => { vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const item: ParticipantFeedback = { id: "private-1", category: "weakness", message: "<script>alert('private')</script>\nملاحظة خاصة", authorName: "مشارك", authorKind: "guest", status: "new", internalNote: "", createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
const initial: PaginatedResult<ParticipantFeedback> = { data: [item], total: 1, page: 1, limit: 20 };

describe("share your opinion form", () => {
  it("explains confidentiality and has no participant-response list", () => {
    render(<FeedbackPage />);
    expect(screen.getByRole("heading", { name: "شاركنا رأيك" })).toBeInTheDocument();
    expect(screen.getByText("تُرسل ملاحظتك بسرية إلى الإدارة والمدربين، ولا تظهر لبقية المشاركين.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "آراء المشاركين" })).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("shows the exact receipt only after server acknowledgement and clears the submitted text", async () => {
    mockFetch.mockResolvedValue(json({ data: { received: true } }));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("نوع المشاركة"), { target: { value: "suggestion" } });
    fireEvent.change(screen.getByLabelText("رأيك أو ملاحظتك"), { target: { value: "  اقتراح خاص  " } });
    fireEvent.click(screen.getByRole("button", { name: "تم" }));
    expect(await screen.findByRole("status")).toHaveTextContent("تم استلام ردك بنجاح");
    const body = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ category: "suggestion", message: "اقتراح خاص" });
    expect(body.submissionId).toMatch(/^[a-f0-9-]{36}$/);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/api/feedback");
    expect(screen.queryByText("اقتراح خاص")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إرسال رأي آخر" }));
    expect(screen.getByLabelText("رأيك أو ملاحظتك")).toHaveValue("");
  });
  it("retains the text and retry key when a save acknowledgement fails, then confirms the successful retry", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connection lost")).mockResolvedValueOnce(json({ data: { received: true } }));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("رأيك أو ملاحظتك"), { target: { value: "رأيي الخاص" } });
    fireEvent.click(screen.getByRole("button", { name: "تم" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر إرسال ردك");
    expect(screen.getByLabelText("رأيك أو ملاحظتك")).toHaveValue("رأيي الخاص");
    expect(screen.queryByText("تم استلام ردك بنجاح")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تم" }));
    expect(await screen.findByRole("status")).toHaveTextContent("تم استلام ردك بنجاح");
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body)).submissionId).toBe(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body)).submissionId);
  });
  it("rejects blank text and never treats an unacknowledged response as a receipt", async () => {
    mockFetch.mockResolvedValue(json({ data: {} }));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("رأيك أو ملاحظتك"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "تم" }));
    expect(screen.getByRole("alert")).toHaveTextContent("اكتب رأيك");
    expect(mockFetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("رأيك أو ملاحظتك"), { target: { value: "نص خاص" } });
    fireEvent.click(screen.getByRole("button", { name: "تم" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذر إرسال ردك"));
    expect(screen.queryByText("تم استلام ردك بنجاح")).not.toBeInTheDocument();
  });
});

describe("staff participant-response inbox", () => {
  it("renders submitted text as escaped plaintext", () => {
    const { container } = render(<ParticipantFeedbackInbox initial={initial} />);
    expect(container.querySelector(".feedback-message")?.textContent).toBe(item.message);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("ردود خاصة لا يطّلع عليها سوى المدير والمدرب.")).toBeInTheDocument();
  });
  it("saves review status and a private internal note, then refreshes the actual server result", async () => {
    const updated = { ...item, status: "reviewed" as const, internalNote: "متابعة داخلية", updatedAt: "2026-10-06T13:00:00Z" };
    mockFetch.mockResolvedValueOnce(json({ data: { updated: true } })).mockResolvedValueOnce(json({ ...initial, data: [updated] }));
    render(<ParticipantFeedbackInbox initial={initial} />);
    fireEvent.change(screen.getByLabelText("حالة الرد"), { target: { value: "reviewed" } });
    fireEvent.change(screen.getByLabelText("ملاحظة داخلية للمدير والمدرب"), { target: { value: "متابعة داخلية" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التحديث" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({ status: "reviewed", internalNote: "متابعة داخلية" });
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/api/participant-feedback/private-1");
    await waitFor(() => expect(screen.getByLabelText("حالة الرد")).toHaveValue("reviewed"));
  });
  it("requires explicit Arabic confirmation before deleting a response", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({ ...initial, data: [], total: 0 }));
    render(<ParticipantFeedbackInbox initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "حذف الرد" }));
    expect(mockFetch).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "حذف" }));
    expect(await screen.findByText("لا توجد ردود ضمن هذه الخيارات.")).toBeInTheDocument();
    expect(mockFetch.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
  it("applies filters on the server and clears all private content if permission is revoked", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...initial, data: [], total: 0 })).mockResolvedValueOnce(json({ error: { code: "forbidden" } }, 403));
    render(<ParticipantFeedbackInbox initial={initial} />);
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "archived" } });
    expect(await screen.findByText("لا توجد ردود ضمن هذه الخيارات.")).toBeInTheDocument();
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain("status=archived");
    fireEvent.click(screen.getByRole("button", { name: "تحديث القائمة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("هذه النافذة متاحة للمدير والمدرب فقط.");
    expect(screen.queryByText("ملاحظة خاصة")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ملاحظة داخلية للمدير والمدرب")).not.toBeInTheDocument();
  });
});
