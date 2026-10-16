import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudyAssistantWidget } from "@/components/study-tools/StudyAssistantWidget";
import { STUDY_ASSISTANT_GREETING, STUDY_ASSISTANT_WELCOME_TITLE } from "@/components/study-tools/StudyAssistantWelcome";
import type { ReactNode } from "react";

const route = vi.hoisted(() => ({ pathname: "/subjects/course/pdf" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({ default: ({ href, onNavigate, children }: { href: string; onNavigate?: () => void; children: ReactNode }) => <a href={href} onClick={event => { event.preventDefault(); onNavigate?.(); }}>{children}</a> }));
const catalog = { subjects: [], sources: [], total: 0, page: 1 };
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  route.pathname = "/subjects/course/pdf";
  fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: catalog }) });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("assistant welcome on entry", () => {
  it("greets before loading the assistant, then focuses the requested platform page without redirecting", async () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const content = <><main id="main-content" tabIndex={-1}>ملفات المادة</main><StudyAssistantWidget welcomeOnEntry /></>;
    const view = render(content);
    const welcome = screen.getByRole("dialog", { name: STUDY_ASSISTANT_WELCOME_TITLE });
    expect(show).toHaveBeenCalledOnce();
    expect(within(welcome).getByText(STUDY_ASSISTANT_GREETING)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: STUDY_ASSISTANT_WELCOME_TITLE })).toHaveFocus();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(within(welcome).getByRole("button", { name: "تصفح المنصة" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    expect(fetcher).not.toHaveBeenCalled();
    expect(document.body.style.overflow).not.toBe("hidden");
    route.pathname = "/subjects/another-course";
    view.rerender(<><main id="main-content" tabIndex={-1}>صفحة المادة</main><StudyAssistantWidget welcomeOnEntry /></>);
    expect(screen.getByText("صفحة المادة")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "فتح المساعد الدراسي" })).toBeInTheDocument();
  });
  it("links the supplied invitation directly to private feedback and releases the entry modal", () => {
    render(<StudyAssistantWidget welcomeOnEntry />);
    const welcome = screen.getByRole("dialog", { name: STUDY_ASSISTANT_WELCOME_TITLE });
    expect(within(welcome).getByText("بكم نرتقي ونتطور. شاركنا رأيك ولا تبخل علينا بأفكارك وملاحظاتك لتطوير محتوى المنصة.")).toBeInTheDocument();
    expect(within(welcome).getByText(/المشاركات تصل بدون اسم/)).toBeInTheDocument();
    const link = within(welcome).getByRole("link", { name: "«شاركنا رأيك»" });
    expect(link).toHaveAttribute("href", "/feedback");
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("opens the actual conversation directly when the visitor chooses the assistant", async () => {
    render(<StudyAssistantWidget welcomeOnEntry />);
    fireEvent.click(screen.getByRole("button", { name: "استخدام المساعد الدراسي" }));
    const chat = screen.getByRole("dialog", { name: "مساعدك الدراسي" });
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(within(chat).getByRole("textbox", { name: "سؤالك الدراسي" })).toHaveFocus();
    expect(within(chat).getByText(STUDY_ASSISTANT_GREETING)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تصفح المنصة" })).not.toBeInTheDocument();
    fireEvent.click(within(chat).getByRole("button", { name: "إغلاق المساعد الدراسي" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "فتح المساعد الدراسي" }));
    expect(screen.getByRole("textbox", { name: "سؤالك الدراسي" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("lets the native Escape action continue to the platform and restores scrolling after unmount", () => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "auto";
    const view = render(<StudyAssistantWidget welcomeOnEntry />);
    const dialog = screen.getByRole("dialog", { name: STUDY_ASSISTANT_WELCOME_TITLE });
    expect(document.body.style.overflow).toBe("hidden");
    const cancel = new Event("cancel", { bubbles: true, cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("auto");
    view.unmount();
    const next = render(<StudyAssistantWidget welcomeOnEntry />);
    expect(screen.getByRole("dialog", { name: STUDY_ASSISTANT_WELCOME_TITLE })).toBeInTheDocument();
    next.unmount(); expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = previous;
  });
});
