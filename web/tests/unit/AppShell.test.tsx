import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { GuestTrainingSession } from "@shared/index";

const route = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a data-client-link {...props} /> }));
import { AppShell } from "@/components/layout/AppShell";

beforeEach(() => { route.pathname = "/dashboard"; });

describe("reference application shell", () => {
  it.each([{ isAdmin: false, isInstructor: false, staff: false }, { isAdmin: true, isInstructor: false, staff: true }, { isAdmin: false, isInstructor: true, staff: true }])("shows feedback navigation for the current role: %o", props => {
    render(<AppShell {...props} userEmail="user@example.com"><p>Content</p></AppShell>);
    const sidebar = within(screen.getByRole("complementary", { name: "Sidebar" }));
    expect(sidebar.getByRole("link", { name: "شاركنا رأيك" })).toHaveAttribute("href", "/feedback");
    if (props.staff) expect(sidebar.getByRole("link", { name: "آراء المشاركين" })).toHaveAttribute("href", "/participant-feedback");
    else expect(sidebar.queryByRole("link", { name: "آراء المشاركين" })).not.toBeInTheDocument();
  });
  it.each(["/quizzes/quiz-1/attempt/attempt-1", "/quizzes/quiz-1/result/attempt-1"])("leaves %s through document links in the sidebar and mobile tabs", pathname => {
    route.pathname = pathname;
    render(<AppShell isAdmin={false} userEmail="learner@example.com"><p>Quiz content</p></AppShell>);
    const sidebar = within(screen.getByRole("complementary", { name: "Sidebar" }));
    const bottom = within(screen.getByRole("navigation", { name: "Bottom" }));
    for (const nav of [sidebar, bottom]) {
      expect(nav.getByRole("link", { name: "المواد الدراسية" })).toHaveAttribute("href", "/subjects");
      expect(nav.getByRole("link", { name: "الاختبارات" })).toHaveAttribute("href", "/subjects?view=assessments");
      expect(nav.getByRole("link", { name: "الاختبارات" })).not.toHaveAttribute("data-client-link");
    }
    expect(sidebar.getByRole("link", { name: "المحاضرات" })).toHaveAttribute("href", "/subjects?view=lectures");
    expect(sidebar.getByRole("link", { name: "الملخصات" })).toHaveAttribute("href", "/subjects?view=summaries");
  });

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
    expect(screen.getAllByRole("link", { name: "شاركنا رأيك" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "آراء المشاركين" })).not.toBeInTheDocument();
  });

  it("opens in the reference light theme and allows explicit dark mode", () => {
    const { container } = render(<AppShell isAdmin={false} userEmail="learner@example.com"><p>Content</p></AppShell>);
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");
    fireEvent.click(screen.getByRole("button", { name: "تفعيل الوضع الداكن" }));
    expect(container.firstElementChild).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "تفعيل الوضع الفاتح" })).toHaveAttribute("aria-pressed", "true");
  });
});
