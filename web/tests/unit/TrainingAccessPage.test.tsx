import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrainingAccessGrantCreated } from "@shared/index";
vi.mock("@/lib/api/adminBrowserClient", () => ({ adminGet: vi.fn(), adminPost: vi.fn(), AdminApiError: class extends Error {} }));
vi.mock("@/components/admin/TrainingAccessQrCode", () => ({ TrainingAccessQrCode: ({ joinUrl }: { joinUrl: string }) => <span data-testid="qr">{joinUrl}</span> }));
import { adminGet, adminPost } from "@/lib/api/adminBrowserClient";
import TrainingAccessPage from "@/app/(app)/admin/training-access/page";
const grant: TrainingAccessGrantCreated = { id: "grant-1", label: "الدخول المفتوح", description: null, maxSessions: null, sessionCount: 0, revoked: false, revokedAt: null, expiresAt: null, createdBy: "admin", createdAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z", token: "permanent-token", joinUrl: "https://web-husen4.vercel.app/join/permanent-token" };
beforeEach(() => {
  vi.mocked(adminGet).mockReset(); vi.mocked(adminPost).mockReset();
  vi.mocked(adminGet).mockImplementation(async path => path.endsWith("/guests") ? [] : [grant]);
  vi.mocked(adminPost).mockImplementation(async path => path.endsWith("/link") ? { grantId: grant.id, joinUrl: grant.joinUrl } : grant);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
describe("permanent training access administration", () => {
  it("shows permanent access and removes all hours/day selection", async () => {
    render(<TrainingAccessPage />);
    expect(await screen.findByText("دائم — دون تاريخ انتهاء")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "رابط دخول جديد" }));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
    expect(screen.getByText(/دون تحديد ساعات أو أيام/)).toBeInTheDocument();
  });
  it("creates a permanent link and QR without sending any lifetime", async () => {
    vi.mocked(adminPost).mockResolvedValue(grant);
    render(<TrainingAccessPage />); await screen.findByText("دائم — دون تاريخ انتهاء");
    fireEvent.click(screen.getByRole("button", { name: "رابط دخول جديد" }));
    fireEvent.change(screen.getByLabelText("اسم الرابط (اختياري)"), { target: { value: "الدخول المفتوح" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء رابط الدخول" }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith("training-access", { label: "الدخول المفتوح", description: null, maxSessions: null }));
    expect(await screen.findByTestId("qr")).toHaveTextContent(grant.joinUrl);
  });
  it("copies the saved link after a page revisit without creating another grant", async () => {
    const first = render(<TrainingAccessPage />);
    expect(await screen.findByLabelText("رابط الدخول المحفوظ")).toHaveValue(grant.joinUrl);
    fireEvent.click(screen.getByRole("button", { name: "نسخ الرابط" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(grant.joinUrl));
    first.unmount(); render(<TrainingAccessPage />);
    expect(await screen.findByLabelText("رابط الدخول المحفوظ")).toHaveValue(grant.joinUrl);
    fireEvent.click(screen.getByRole("button", { name: "عرض الرابط وQR" }));
    expect(await screen.findByTestId("qr")).toHaveTextContent(grant.joinUrl);
    expect(vi.mocked(adminPost).mock.calls.every(([path]) => path.endsWith("/link"))).toBe(true);
  });
  it("prefers the most-used published link rather than the newest unused grant", async () => {
    const used = { ...grant, id: "used-link", sessionCount: 155 };
    vi.mocked(adminGet).mockImplementation(async path => path.endsWith("/guests") ? [] : [grant, used]);
    render(<TrainingAccessPage />);
    await waitFor(() => expect(screen.getByLabelText("اختر الرابط")).toHaveValue("used-link"));
    expect(adminPost).toHaveBeenCalledWith("training-access/used-link/link");
  });
  it("offers manual copy when the browser blocks the clipboard", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("permission"));
    render(<TrainingAccessPage />); await screen.findByLabelText("رابط الدخول المحفوظ");
    fireEvent.click(screen.getByRole("button", { name: "نسخ الرابط" }));
    expect(await screen.findByText(/تعذر النسخ التلقائي/)).toBeInTheDocument();
    expect(screen.getByLabelText("رابط الدخول المحفوظ")).toHaveValue(grant.joinUrl);
  });
  it("cleans disabled records through the protected action and keeps the active link", async () => {
    render(<TrainingAccessPage />); await screen.findByLabelText("رابط الدخول المحفوظ");
    fireEvent.click(screen.getByText("إدارة روابط الدخول"));
    fireEvent.click(screen.getByRole("button", { name: "تنظيف السجلات المعطلة" }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith("training-access/cleanup"));
    expect(await screen.findByText(/تم تنظيف السجلات المعطلة/)).toBeInTheDocument();
    expect(screen.getByLabelText("رابط الدخول المحفوظ")).toHaveValue(grant.joinUrl);
  });
});
