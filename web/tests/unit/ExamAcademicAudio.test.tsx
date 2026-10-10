import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ExamAudioChapter } from "@shared/index";
import { ExamAudioPlayer } from "@/components/exam-material/ExamAudioPlayer";

const subjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const groupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const chapterId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const chapters: ExamAudioChapter[] = [{ id: chapterId, lectureId: chapterId, title: "المحاضرة الأولى", chunks: ["عنوان المحور.", "محتوى معتمد."], segments: [
  { kind: "heading", text: "عنوان المحور.", pauseAfterMs: 900 },
  { kind: "body", text: "محتوى معتمد.", pauseAfterMs: 1400 },
] }];
let play: ReturnType<typeof vi.spyOn>;
let load: ReturnType<typeof vi.spyOn>;
let requests: ReturnType<typeof vi.fn>;
const renderPlayer = () => render(<ExamAudioPlayer subjectId={subjectId} groupId={groupId} chapters={chapters} />);
const player = () => screen.getByLabelText("صوت المراجعة الأكاديمية") as HTMLAudioElement;

beforeEach(() => {
  localStorage.clear();
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  requests = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal("fetch", requests);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:narration") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("speechSynthesis", undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("actual neural academic podcast", () => {
  it("offers six real persons including Iraqi male/female voices without device TTS", async () => {
    renderPlayer(); await act(async () => {});
    const options = screen.getAllByRole("option").filter(option => option.getAttribute("value")?.endsWith("Neural"));
    expect(options).toHaveLength(6);
    expect(screen.getByRole("combobox", { name: "الصوت العربي" })).toHaveValue("ar-IQ-BasselNeural");
    expect(screen.getByRole("option", { name: "رنا — عراقية (امرأة)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    expect(player().getAttribute("src")).toBe(`/api/exam-material/${subjectId}/${groupId}/audio.mp3?chapter=${chapterId}&segment=0&voice=ar-IQ-BasselNeural`);
    expect(player().playbackRate).toBe(1.1); expect(player().preservesPitch).toBe(true);
    fireEvent.playing(player()); expect(screen.getByRole("status")).toHaveTextContent("قيد التشغيل");
    fireEvent.click(screen.getByRole("button", { name: "إيقاف مؤقت" }));
    fireEvent.click(screen.getByRole("button", { name: "استئناف" }));
    expect(play).toHaveBeenCalledTimes(2); expect(load).toHaveBeenCalledTimes(1);
  });
  it("preserves the heading pause through pause/resume instead of rushing the next segment", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    renderPlayer(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" })); fireEvent.ended(player());
    act(() => vi.advanceTimersByTime(700)); expect(play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "إيقاف مؤقت" }));
    act(() => vi.advanceTimersByTime(10_000)); expect(play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "استئناف" }));
    act(() => vi.advanceTimersByTime(199)); expect(play).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1)); expect(play).toHaveBeenCalledTimes(2);
    expect(player().src).toContain("segment=1");
    fireEvent.ended(player()); expect(screen.getByRole("status")).toHaveTextContent("جاهز");
  });
  it("changes speed without restarting, switches the actual voice and aborts old prefetches", async () => {
    renderPlayer(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    const previous = requests.mock.calls[0]![1] as RequestInit;
    fireEvent.change(screen.getByRole("combobox", { name: "سرعة الإلقاء" }), { target: { value: "1.25" } });
    expect(player().playbackRate).toBe(1.25); expect(play).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole("combobox", { name: "الصوت العربي" }), { target: { value: "ar-IQ-RanaNeural" } });
    expect(previous.signal!.aborted).toBe(true); expect(player().src).toContain("voice=ar-IQ-RanaNeural");
    expect(play).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem("digital-leadership:academic-audio")!)).toEqual({ voice: "ar-IQ-RanaNeural", rate: 1.25 });
  });
  it("keeps failures retryable and ignores a rejected play promise from a stopped session", async () => {
    let reject!: (reason: unknown) => void;
    play.mockImplementationOnce(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
    renderPlayer(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    fireEvent.click(screen.getByRole("button", { name: "إيقاف" }));
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    await act(async () => { reject(new DOMException("old session", "NotAllowedError")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.error(player()); expect(screen.getByRole("alert")).toHaveTextContent("أعد المحاولة");
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("cancels playback and ignores stale media callbacks after unmount", async () => {
    const view = renderPlayer(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "تشغيل المراجعة" }));
    const staleEnd = player().onended!, media = player(), previous = requests.mock.calls[0]![1] as RequestInit;
    view.unmount(); act(() => staleEnd.call(media, new Event("ended")));
    expect(previous.signal!.aborted).toBe(true); expect(media.getAttribute("src")).toBeNull(); expect(play).toHaveBeenCalledOnce();
  });
  it("restores valid preferences and rejects empty chapters", async () => {
    localStorage.setItem("digital-leadership:academic-audio", JSON.stringify({ voice: "ar-IQ-RanaNeural", rate: 1.5 }));
    render(<ExamAudioPlayer subjectId={subjectId} groupId={groupId} chapters={[]} />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "الصوت العربي" })).toHaveValue("ar-IQ-RanaNeural"));
    expect(screen.getByRole("combobox", { name: "سرعة الإلقاء" })).toHaveValue("1.5");
    expect(screen.getByRole("button", { name: "تشغيل المراجعة" })).toBeDisabled();
  });
});
