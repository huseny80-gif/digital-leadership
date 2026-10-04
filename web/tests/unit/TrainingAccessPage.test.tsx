import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrainingAccessGrantCreated } from "@shared/index";
vi.mock("@/lib/api/adminBrowserClient", () => ({ adminGet: vi.fn(), adminPost: vi.fn(), AdminApiError: class extends Error {} }));
vi.mock("@/components/admin/TrainingAccessQrCode", () => ({ TrainingAccessQrCode: ({ joinUrl }: { joinUrl: string }) => <span data-testid="qr">{joinUrl}</span> }));
import { adminGet, adminPost } from "@/lib/api/adminBrowserClient";
import TrainingAccessPage from "@/app/(app)/admin/training-access/page";
const grant: TrainingAccessGrantCreated = { id: "grant-1", label: "الدخول المفتوح", description: null, maxSessions: null, sessionCount: 0, revoked: false, revokedAt: null, expiresAt: null, createdBy: "admin", createdAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z", token: "permanent-token", joinUrl: "https://web-husen4.vercel.app/join/permanent-token" };
beforeEach(() => { vi.mocked(adminGet).mockReset(); vi.mocked(adminPost).mockReset(); vi.mocked(adminGet).mockImplementation(async path => path.endsWith("/guests") ? [] : [grant]); });
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
    fireEvent.change(screen.getByLabelText("Label (optional)"), { target: { value: "الدخول المفتوح" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Access Link" }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith("training-access", { label: "الدخول المفتوح", description: null, maxSessions: null }));
    expect(await screen.findByTestId("qr")).toHaveTextContent(grant.joinUrl);
  });
});
