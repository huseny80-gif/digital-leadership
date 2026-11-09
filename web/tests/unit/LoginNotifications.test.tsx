import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { NotificationsHub } from "@/components/learning/NotificationsHub";
import { AppShell } from "@/components/layout/AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ prefetch: _prefetch, onNavigate: _onNavigate, ...props }: ComponentProps<"a"> & { prefetch?: boolean; onNavigate?: () => void }) => <a {...props} /> }));
vi.mock("@/components/learning/LearningProvider", () => ({
  LearningProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLearning: () => ({ loading: false, error: null, refresh: vi.fn(), overview: { activities: [{ id: "task", kind: "assignment", dueAt: "2026-11-10T10:00:00Z", status: "pending", title: "موعد المهمة", subjectTitle: "مادة دراسية", href: "/subjects/course/assignments/task" }] } }),
}));
const id = "11111111-1111-4111-8111-111111111111";
const visitor = "22222222-2222-4222-8222-222222222222";
const feed = () => ({ items: [
  { id, kind: "trainee", displayName: "متدرب مسجل", enteredAt: "2026-11-08T10:00:00.000Z", read: false },
  { id: visitor, kind: "visitor", displayName: "زائر جديد", enteredAt: "2026-11-08T09:00:00.000Z", read: false },
], unreadCount: 2, latestId: id });
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
const props = { open: true, onToggle: vi.fn(), onClose: vi.fn(), isAdmin: true };
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(feed()))); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("admin bell login events", () => {
  it("shows verified trainee and visitor entries, times, unread count and existing deadlines", async () => {
    render(<NotificationsHub {...props} />);
    await screen.findByText("متدرب مسجل");
    expect(screen.getByText("زائر جديد")).toBeInTheDocument();
    expect(screen.getByText("دخول متدرب")).toBeInTheDocument();
    expect(screen.getByText("دخول زائر")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /موعد المهمة/ })).toHaveAttribute("href", "/subjects/course/assignments/task");
    expect(within(screen.getByRole("button", { name: /^الإشعارات/ })).getByText("٣")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/admin/login-notifications", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
    expect(document.querySelector("time[datetime='2026-11-08T10:00:00.000Z']")).not.toBeNull();
  });
  it("never fetches or displays other people's entries for learners or visitors", async () => {
    render(<NotificationsHub {...props} isAdmin={false} />);
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("متدرب مسجل")).not.toBeInTheDocument();
    expect(screen.queryByText("دخول المتدربين والزوار")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "الإشعارات — المواعيد: 1" })).toBeInTheDocument();
  });
  it("acknowledges only the displayed snapshot and uses the returned unread count for a later arrival", async () => {
    const late = { ...feed().items[0], id: "33333333-3333-4333-8333-333333333333", displayName: "دخول لاحق" };
    vi.mocked(fetch).mockResolvedValueOnce(json(feed())).mockResolvedValueOnce(json({ recorded: true }))
      .mockResolvedValueOnce(json({ items: [late, ...feed().items.map(item => ({ ...item, read: true }))], unreadCount: 1, latestId: late.id }));
    render(<NotificationsHub {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "تحديد الكل كمقروء" }));
    await screen.findByText("دخول لاحق");
    expect(fetch).toHaveBeenCalledWith("/api/admin/login-notifications/read", expect.objectContaining({ method: "POST", body: JSON.stringify({ throughId: id }) }));
    expect(within(screen.getByRole("button", { name: /^الإشعارات/ })).getByText("٢")).toBeInTheDocument();
  });
  it("does not expose stale admin data after the role changes or a late response arrives", async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const { rerender } = render(<NotificationsHub {...props} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender(<NotificationsHub {...props} isAdmin={false} />);
    await act(async () => { complete(json(feed())); });
    expect(screen.queryByText("متدرب مسجل")).not.toBeInTheDocument();
  });
  it("shows a safe error and recovers on retry instead of claiming there are no entries", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(null, 500)).mockResolvedValueOnce(json(feed()));
    render(<NotificationsHub {...props} />);
    await screen.findByText("تعذر تحميل إشعارات الدخول. أعد المحاولة.");
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل إشعارات الدخول" }));
    await screen.findByText("متدرب مسجل");
  });
  it("refreshes on opening the bell and focus, and escapes participant names", async () => {
    const unsafe = feed(); unsafe.items[0].displayName = "<img src=x onerror=alert(1)>";
    vi.mocked(fetch).mockImplementation(async () => json(unsafe));
    const { rerender, container } = render(<NotificationsHub {...props} open={false} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender(<NotificationsHub {...props} />);
    await screen.findByText(unsafe.items[0].displayName);
    expect(container.querySelector("img[src='x']")).toBeNull();
    fireEvent.focus(window);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });
  it("polls visible admin activity every thirty seconds and pauses background polling", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<NotificationsHub {...props} open={false} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not clear unread entries when saving their read status fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(feed())).mockResolvedValueOnce(json(null, 500));
    render(<NotificationsHub {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "تحديد الكل كمقروء" }));
    await screen.findByText("تعذر حفظ حالة القراءة. أعد المحاولة.");
    expect(within(screen.getByRole("button", { name: /^الإشعارات/ })).getByText("٣")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تحديد الكل كمقروء" })).toBeEnabled();
  });
  it("finishes an acknowledged read when the bell closes and remains usable when reopened", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async path => String(path).endsWith("/read")
      ? new Promise<Response>(resolve => { finish = resolve; }) : json(feed()));
    const { rerender } = render(<NotificationsHub {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "تحديد الكل كمقروء" }));
    await screen.findByRole("button", { name: "جارٍ حفظ القراءة…" });
    rerender(<NotificationsHub {...props} open={false} />);
    await act(async () => { finish(json({ recorded: true })); });
    rerender(<NotificationsHub {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "تحديد الكل كمقروء" })).toBeEnabled());
  });
});

describe("trusted learner entry reporting", () => {
  it("reports a learner's entry without sending a caller-selected identity and keeps it once across rerenders", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ recorded: true }));
    const { rerender } = render(<AppShell isAdmin={false} userEmail="learner@example.com"><p>Page</p></AppShell>);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/learning/entry", expect.objectContaining({ method: "POST", credentials: "same-origin", body: "{}" })));
    rerender(<AppShell isAdmin={false} userEmail="learner@example.com"><p>Next page</p></AppShell>);
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/learning/entry")).toHaveLength(1);
  });
  it.each([{ isAdmin: true }, { isAdmin: false, isInstructor: true }])("does not report staff as trainees: %o", async roles => {
    render(<AppShell {...roles} userEmail="staff@example.com"><p>Page</p></AppShell>);
    await act(async () => {});
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/learning/entry")).toHaveLength(0);
  });
});
