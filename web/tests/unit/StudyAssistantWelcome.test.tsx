import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudyAssistantWidget } from "@/components/study-tools/StudyAssistantWidget";
import { STUDY_ASSISTANT_GREETING } from "@/components/study-tools/StudyAssistantWelcome";

const route = vi.hoisted(() => ({ pathname: "/subjects/course/pdf" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
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
    const welcome = screen.getByRole("dialog", { name: STUDY_ASSISTANT_GREETING });
    expect(show).toHaveBeenCalledOnce();
    expect(within(welcome).getByText("مساعدك الدراسي")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: STUDY_ASSISTANT_GREETING })).toHaveFocus();
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
    const dialog = screen.getByRole("dialog", { name: STUDY_ASSISTANT_GREETING });
    expect(document.body.style.overflow).toBe("hidden");
    const cancel = new Event("cancel", { bubbles: true, cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("auto");
    view.unmount();
    const next = render(<StudyAssistantWidget welcomeOnEntry />);
    expect(screen.getByRole("dialog", { name: STUDY_ASSISTANT_GREETING })).toBeInTheDocument();
    next.unmount(); expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = previous;
  });
});
