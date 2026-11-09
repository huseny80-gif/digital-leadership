import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLecturePodcast, loadSubjectSummaries, studyRetryDelay, waitForStudyRetry } from "@/components/content/subjectSummaryData";
import { audioResponse, jsonResponse, summaryFixture } from "./fixtures/subjectSummaries";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("bounded subject document and audio preparation", () => {
  it("waits for the server's preparation interval and then reads the same subject", async () => {
    vi.useFakeTimers();
    const data = summaryFixture(), preparing = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ error: { code: "study_module_preparing" } }, 503, { "Retry-After": "1" })).mockResolvedValueOnce(jsonResponse({ data })));
    const pending = loadSubjectSummaries(data.subjectId, new AbortController().signal, preparing);
    await vi.advanceTimersByTimeAsync(0);
    expect(preparing).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999); expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).subjectId).toBe(data.subjectId);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps the exact lecture revision and voice while audio is preparing", async () => {
    vi.useFakeTimers();
    const lecture = summaryFixture().lectures[5], preparing = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ error: { code: "audio_preparing" } }, 503, { "Retry-After": "1" })).mockResolvedValueOnce(audioResponse()));
    const pending = loadLecturePodcast(lecture, "iraqi-female", new AbortController().signal, preparing);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).size).toBe(256);
    expect(preparing).toHaveBeenCalledTimes(1);
    for (const [url] of vi.mocked(fetch).mock.calls) expect(url).toBe(`${lecture.audioUrl}&voice=iraqi-female`);
  });
  it("stops a pending preparation when its lecture is closed or voice is changed", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = waitForStudyRetry(10000, controller.signal).then(() => "unexpected", error => error.name);
    controller.abort();
    expect(await result).toBe("AbortError");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not turn a failed provider response into another preparation loop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { code: "audio_unavailable" } }, 503)));
    await expect(loadLecturePodcast(summaryFixture().lectures[0], "msa-male", new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: "audio" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds repeated preparation responses rather than waiting forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => jsonResponse({ error: { code: "audio_preparing" } }, 503, { "Retry-After": "1" })));
    const result = loadLecturePodcast(summaryFixture().lectures[0], "msa-male", new AbortController().signal, vi.fn()).then(() => "unexpected", error => error.code);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toBe("audio");
    expect(fetch).toHaveBeenCalledTimes(9);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds retry header values and rejects unknown voices before sending a request", async () => {
    expect(studyRetryDelay(new Response(null, { headers: { "Retry-After": "10000" } }))).toBe(10000);
    expect(studyRetryDelay(new Response(null, { headers: { "Retry-After": "invalid" } }))).toBe(10000);
    vi.stubGlobal("fetch", vi.fn());
    await expect(loadLecturePodcast(summaryFixture().lectures[0], "another-person", new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: "audio" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
