import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { STUDY_VOICES } from "@digital-leadership/shared";
import { LecturePodcast } from "@/components/content/LecturePodcast";
import { audioResponse, jsonResponse, summaryFixture } from "./fixtures/subjectSummaries";

const data = summaryFixture();
const lecture = data.lectures[0];
const makeUrl = vi.fn(), revokeUrl = vi.fn();
beforeEach(() => {
  localStorage.clear();
  makeUrl.mockReset().mockReturnValue("blob:local-podcast-fixture"); revokeUrl.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: makeUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => audioResponse()));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const mount = () => render(<LecturePodcast subjectId={data.subjectId} lecture={lecture} voices={data.voices} onRefreshSummary={vi.fn()} />);

describe("one lecture's source-bound podcast", () => {
  it.each(STUDY_VOICES)("prepares $id only after the learner requests playback with that lecture's revision", async voice => {
    mount();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("الصوت واللهجة"), { target: { value: voice.id } });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    const player = await screen.findByLabelText(`تسجيل ${lecture.title}`);
    expect(player).toHaveAttribute("src", "blob:local-podcast-fixture");
    expect(player).not.toHaveAttribute("autoplay");
    expect(fetch).toHaveBeenCalledWith(`${lecture.audioUrl}&voice=${voice.id}`, expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }));
    expect(screen.getByRole("link", { name: "تحميل البودكاست" })).toHaveAttribute("href", "blob:local-podcast-fixture");
  });

  it("cancels a pending voice and ignores its late response", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    fireEvent.change(screen.getByLabelText("الصوت واللهجة"), { target: { value: "iraqi-female" } });
    expect(signal.aborted).toBe(true);
    finish(audioResponse());
    await waitFor(() => expect(screen.getByRole("button", { name: "تشغيل البودكاست" })).toBeInTheDocument());
    expect(makeUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    await screen.findByLabelText(`تسجيل ${lecture.title}`);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(`${lecture.audioUrl}&voice=iraqi-female`);
  });

  it("shows provider failure once and lets the learner explicitly retry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: { code: "audio_unavailable" } }, 503));
    mount(); fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    expect(await screen.findByRole("button", { name: "إعادة تجهيز البودكاست" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(`تسجيل ${lecture.title}`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تجهيز البودكاست" }));
    await screen.findByLabelText(`تسجيل ${lecture.title}`);
  });

  it("requests a summary refresh after a stale audio revision", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { code: "conflict" } }, 409));
    const refresh = vi.fn();
    render(<LecturePodcast subjectId={data.subjectId} lecture={lecture} voices={data.voices} onRefreshSummary={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    fireEvent.click(await screen.findByRole("button", { name: "تحديث الملخص" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("enables native seek and speed only on the loaded recording and revokes it on voice change", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    const player = await screen.findByLabelText<HTMLAudioElement>(`تسجيل ${lecture.title}`);
    expect(screen.getByRole("button", { name: "رجوع ١٥ ثانية" })).toBeDisabled();
    Object.defineProperty(player, "duration", { value: 300 }); player.currentTime = 20;
    fireEvent.loadedMetadata(player);
    fireEvent.click(screen.getByRole("button", { name: "رجوع ١٥ ثانية" })); expect(player.currentTime).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "تقديم ١٥ ثانية" })); expect(player.currentTime).toBe(20);
    fireEvent.change(screen.getByLabelText("سرعة الاستماع"), { target: { value: "1.15" } });
    await waitFor(() => expect(player.playbackRate).toBe(1.15));
    fireEvent.change(screen.getByLabelText("الصوت واللهجة"), { target: { value: "saudi-female" } });
    expect(revokeUrl).toHaveBeenCalledWith("blob:local-podcast-fixture");
    expect(screen.getByRole("button", { name: "رجوع ١٥ ثانية" })).toBeDisabled();
  });

  it("keeps the recording available if Safari requires a second explicit play gesture", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException("gesture needed", "NotAllowedError"));
    mount(); fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    expect(await screen.findByText(/اضغط زر التشغيل في المشغّل/)).toBeInTheDocument();
    expect(screen.getByLabelText(`تسجيل ${lecture.title}`)).toBeInTheDocument();
  });

  it("rejects a successful JSON error page instead of claiming the audio is ready", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: "not audio" }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "تشغيل البودكاست" }));
    await screen.findByRole("button", { name: "إعادة تجهيز البودكاست" });
    expect(makeUrl).not.toHaveBeenCalled();
  });
});
