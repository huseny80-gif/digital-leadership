import { afterEach, describe, expect, it, vi } from "vitest";
import { AcademicSpeechCache, AcademicSpeechUnavailable, academicSpeechSsml, speechServiceHash } from "../../src/examMaterials/academicSpeech.js";
import type { AcademicVoiceId } from "@digital-leadership/shared";

afterEach(() => { vi.useRealTimers(); });
describe("neural speech adapter and bounded cache", () => {
  it("escapes source text, fixes neutral prosody and allows only actual catalog voices", () => {
    const ssml = academicSpeechSsml('نص <مهم> & "واضح"', "ar-IQ-RanaNeural");
    expect(ssml).toContain('xml:lang="ar-IQ"'); expect(ssml).toContain('name="ar-IQ-RanaNeural"');
    expect(ssml).toContain('&lt;مهم&gt; &amp; &quot;واضح&quot;'); expect(ssml).toContain('pitch="+0Hz" rate="+0%"');
    for (const [text, voice] of [["", "ar-IQ-BasselNeural"], ["x".repeat(2501), "ar-IQ-BasselNeural"], ["نص", "injected"]]) expect(() => academicSpeechSsml(text!, voice as AcademicVoiceId)).toThrow(AcademicSpeechUnavailable);
  });
  it("keeps the public protocol hash stable only within the same five-minute bucket", () => {
    const stamp = Date.UTC(2026, 9, 10, 10, 0);
    expect(speechServiceHash(stamp)).toMatch(/^[A-F0-9]{64}$/);
    expect(speechServiceHash(stamp + 299_000)).toBe(speechServiceHash(stamp));
    expect(speechServiceHash(stamp + 300_000)).not.toBe(speechServiceHash(stamp));
  });
  it("deduplicates concurrent segments while keeping persons and changed text separate", async () => {
    const synthesize = vi.fn(async () => Buffer.from("mp3")), cache = new AcademicSpeechCache(synthesize);
    const bytes = await Promise.all([cache.audio("نص", "ar-IQ-BasselNeural"), cache.audio("نص", "ar-IQ-BasselNeural")]);
    expect(bytes[0]).toEqual(bytes[1]); expect(synthesize).toHaveBeenCalledOnce();
    await cache.audio("نص", "ar-IQ-BasselNeural"); expect(synthesize).toHaveBeenCalledOnce();
    await cache.audio("نص", "ar-IQ-RanaNeural"); await cache.audio("نص جديد", "ar-IQ-BasselNeural");
    expect(synthesize).toHaveBeenCalledTimes(3);
  });
  it("does not poison retries after provider failure, and rejects empty audio", async () => {
    const synthesize = vi.fn().mockRejectedValueOnce(new AcademicSpeechUnavailable()).mockResolvedValueOnce(Buffer.alloc(0)).mockResolvedValue(Buffer.from("mp3"));
    const cache = new AcademicSpeechCache(synthesize);
    await expect(cache.audio("نص", "ar-IQ-BasselNeural")).rejects.toThrow(AcademicSpeechUnavailable);
    await expect(cache.audio("نص", "ar-IQ-BasselNeural")).rejects.toThrow(AcademicSpeechUnavailable);
    await expect(cache.audio("نص", "ar-IQ-BasselNeural")).resolves.toEqual(Buffer.from("mp3"));
    expect(synthesize).toHaveBeenCalledTimes(3);
  });
  it("expires cached audio and evicts old segments within the memory budget", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    const synthesize = vi.fn(async () => Buffer.from("mp3")), cache = new AcademicSpeechCache(synthesize, 6, 100);
    await cache.audio("أ", "ar-IQ-BasselNeural"); await cache.audio("ب", "ar-IQ-BasselNeural"); await cache.audio("ج", "ar-IQ-BasselNeural");
    await cache.audio("أ", "ar-IQ-BasselNeural"); expect(synthesize).toHaveBeenCalledTimes(4);
    vi.setSystemTime(1_101); await cache.audio("أ", "ar-IQ-BasselNeural"); expect(synthesize).toHaveBeenCalledTimes(5);
  });
  it("bounds distinct in-flight syntheses while permitting a shared request", async () => {
    let done!: (bytes: Buffer) => void; const promise = new Promise<Buffer>(resolve => { done = resolve; });
    const synthesize = vi.fn(() => promise), cache = new AcademicSpeechCache(synthesize);
    const running = Array.from({ length: 6 }, (_, n) => cache.audio(String(n), "ar-IQ-BasselNeural"));
    const shared = cache.audio("0", "ar-IQ-BasselNeural");
    await expect(cache.audio("extra", "ar-IQ-BasselNeural")).rejects.toThrow(AcademicSpeechUnavailable);
    expect(synthesize).toHaveBeenCalledTimes(6); done(Buffer.from("mp3")); await Promise.all([...running, shared]);
  });
});
