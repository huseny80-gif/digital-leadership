import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { GuestTrainingSession } from "@shared/index";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { AppShell } from "@/components/layout/AppShell";

describe("reference application shell", () => {
  it("keeps navigation, search and account actions functional", () => {
    const { container } = render(<AppShell isAdmin userEmail="admin@example.com" userDisplayName="Admin"><p>Content</p></AppShell>);
    expect(screen.getByRole("search")).toHaveAttribute("action", "/subjects");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(container.firstElementChild).toHaveAttribute("data-navigation-open", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.firstElementChild).toHaveAttribute("data-navigation-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "قائمة الحساب" }));
    expect(screen.getByRole("link", { name: "الإدارة" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "الملف الشخصي" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("does not expose registered account actions to guests", () => {
    render(<AppShell isAdmin={false} userEmail={null} guestSession={{ displayName: "Guest" } as GuestTrainingSession}><p>Guest content</p></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "قائمة الحساب" }));
    expect(screen.queryByRole("link", { name: "الإدارة" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "الملف الشخصي" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "خروج" })).toBeInTheDocument();
  });

  it("opens in the reference light theme and allows explicit dark mode", () => {
    const { container } = render(<AppShell isAdmin={false} userEmail="learner@example.com"><p>Content</p></AppShell>);
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");
    fireEvent.click(screen.getByRole("button", { name: "تفعيل الوضع الداكن" }));
    expect(container.firstElementChild).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "تفعيل الوضع الفاتح" })).toHaveAttribute("aria-pressed", "true");
  });
});
