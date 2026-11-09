import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseNarrationCache } from "../../src/studyTools/courseNarrationCache.js";

const identity = { subjectId: "subject", lectureId: "lecture", sourceRevision: "source", summaryRevision: "summary", voice: "ar-IQ-BasselNeural" as const };
function completeMp3() {
  return Buffer.concat(Array.from({ length: 2 }, () => {
    const frame = Buffer.alloc(144); frame.set([0xff, 0xf3, 0x64, 0xc4]); return frame;
  }));
}
afterEach(() => { vi.restoreAllMocks(); });

describe("bounded complete-lecture audio cache", () => {
  it("isolates subject, lecture, source, transcript and actual voice identities", async () => {
    const cache = new CourseNarrationCache(), bytes = completeMp3();
    const prepare = vi.fn(async (append: (part: Buffer) => void) => { append(bytes); });
    const first = await cache.audio(identity, prepare);
    expect((await cache.audio({ ...identity }, prepare)).bytes === first.bytes).toBe(true);
    for (const changed of [{ subjectId: "other-subject" }, { lectureId: "other-lecture" }, { sourceRevision: "other-source" }, { summaryRevision: "other-summary" }, { voice: "ar-IQ-RanaNeural" as const }]) {
      const separated = await cache.audio({ ...identity, ...changed }, prepare);
      expect(separated.bytes === first.bytes).toBe(false);
    }
    expect(prepare).toHaveBeenCalledTimes(6);
  });
  it("evicts the least-recent recording within its byte budget and expires retained audio", async () => {
    const bytes = completeMp3(), cache = new CourseNarrationCache(bytes.length * 2, 6, 100);
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const prepare = vi.fn(async (append: (part: Buffer) => void) => { append(bytes); });
    const audio = (lectureId: string) => cache.audio({ ...identity, lectureId }, prepare);
    await audio("first"); await audio("second"); await audio("first"); await audio("third");
    await audio("first"); expect(prepare).toHaveBeenCalledTimes(3);
    await audio("second"); expect(prepare).toHaveBeenCalledTimes(4);
    clock.mockReturnValue(1101);
    await audio("first"); expect(prepare).toHaveBeenCalledTimes(5);
  });
  it("bounds distinct pending jobs while sharing one unfinished lecture", async () => {
    const bytes = completeMp3(), cache = new CourseNarrationCache(bytes.length * 2, 2);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const prepare = vi.fn(async (append: (part: Buffer) => void) => { append(bytes); await gate; });
    const first = cache.audio(identity, prepare), shared = cache.audio(identity, prepare);
    const other = cache.audio({ ...identity, lectureId: "other" }, prepare);
    await expect(cache.audio({ ...identity, lectureId: "excess" }, prepare)).rejects.toMatchObject({ reason: "capacity" });
    expect(prepare).toHaveBeenCalledTimes(2);
    release();
    const [audio, reused] = await Promise.all([first, shared, other]);
    expect(reused.bytes === audio.bytes).toBe(true);
  });
  it("bounds all unfinished assembly bytes together and frees reservations after failure", async () => {
    const bytes = completeMp3(), cache = new CourseNarrationCache(bytes.length, 2);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = cache.audio(identity, async append => { append(bytes); await gate; });
    await expect(cache.audio({ ...identity, lectureId: "over-budget" }, async append => { append(bytes); })).rejects.toMatchObject({ reason: "capacity" });
    release(); await first;
    await expect(cache.audio({ ...identity, lectureId: "after-release" }, async append => { append(bytes); })).resolves.toMatchObject({ voice: identity.voice });
  });
  it("bounds zero-byte failure outcomes and rejects invalid completed audio", async () => {
    const cache = new CourseNarrationCache(1024, 6, 1000, 1);
    const bad = vi.fn(async (append: (part: Buffer) => void) => { append(Buffer.from("not an mp3")); });
    await expect(cache.audio(identity, bad)).rejects.toMatchObject({ reason: "invalid_audio" });
    await expect(cache.audio(identity, bad)).rejects.toMatchObject({ reason: "invalid_audio" });
    expect(bad).toHaveBeenCalledOnce();
    await expect(cache.audio({ ...identity, lectureId: "another-failure" }, bad)).rejects.toMatchObject({ reason: "invalid_audio" });
    await expect(cache.audio(identity, bad)).rejects.toMatchObject({ reason: "invalid_audio" });
    expect(bad).toHaveBeenCalledTimes(3);
  });
});
