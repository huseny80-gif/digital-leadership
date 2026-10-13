import type { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface WireSocket extends EventEmitter {
  url: string;
  readyState: number;
  options: { headers: Record<string, string>; handshakeTimeout: number; maxPayload: number };
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}
const wire = vi.hoisted(() => ({ sockets: [] as WireSocket[] }));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeSocket extends EventEmitter {
    static OPEN = 1;
    readyState = 0;
    send = vi.fn(); close = vi.fn(); terminate = vi.fn();
    constructor(readonly url: string, readonly options: WireSocket["options"]) {
      super(); wire.sockets.push(this);
    }
  }
  return { default: FakeSocket };
});
import { AcademicSpeechUnavailable, isAcademicMp3, probeAcademicSpeech, speechServiceHash, synthesizeAcademicSpeech } from "../../src/examMaterials/academicSpeech.js";

// Two complete MPEG-2 Layer III frames, 48 kbps / 24 kHz / mono.
const mp3 = () => Buffer.concat(Array.from({ length: 2 }, () => {
  const frame = Buffer.alloc(144); frame.set([0xff, 0xf3, 0x64, 0xc4]); return frame;
}));
function audioPacket(bytes: Buffer, path = "audio") {
  const headers = Buffer.from(`Path:${path}\r\nContent-Type:audio/mpeg\r\n`);
  const length = Buffer.alloc(2); length.writeUInt16BE(headers.length);
  return Buffer.concat([length, headers, bytes]);
}
function end(socket: WireSocket, bytes = mp3()) {
  socket.emit("message", audioPacket(bytes), true);
  socket.emit("message", Buffer.from("X-RequestId:public-test\r\nPath:turn.end\r\n"), false);
}
beforeEach(() => { wire.sockets.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe("current Read Aloud synthesis transport", () => {
  it("uses the current synthesis host and subscription parameter, retaining actual person and audio quality", async () => {
    const request = synthesizeAcademicSpeech("محتوى <معتمد>", "ar-IQ-RanaNeural"), socket = wire.sockets[0]!;
    const url = new URL(socket.url);
    expect(url.origin).toBe("wss://api.msedgeservices.com");
    expect(url.pathname).toBe("/tts/cognitiveservices/websocket/v1");
    expect(url.searchParams.has("Ocp-Apim-Subscription-Key")).toBe(true);
    expect(url.searchParams.has("TrustedClientToken")).toBe(false);
    expect(socket.options.handshakeTimeout).toBe(10000);
    expect(socket.options.maxPayload).toBe(2 * 1024 * 1024);
    expect(Object.keys(socket.options.headers).map(key => key.toLowerCase())).not.toContain("authorization");
    socket.readyState = 1; socket.emit("open");
    const config = String(socket.send.mock.calls[0]![0]), ssml = String(socket.send.mock.calls[1]![0]);
    expect(config).toContain('"outputFormat":"audio-24khz-96kbitrate-mono-mp3"');
    expect(ssml).toMatch(/X-Timestamp:[^\r]+Z\r\nPath:ssml/);
    expect(ssml).toContain('name="ar-IQ-RanaNeural"'); expect(ssml).toContain("&lt;معتمد&gt;");
    end(socket); await expect(request).resolves.toEqual(mp3()); expect(socket.close).toHaveBeenCalledOnce();
    // A late close must not convert an already completed MP3 to a failure.
    socket.emit("close", 1000);
  });
  it("reassembles fragmented binary audio and ignores unrelated protocol frames", async () => {
    const request = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-BasselNeural"), socket = wire.sockets[0]!, bytes = mp3();
    socket.emit("message", audioPacket(Buffer.from("metadata"), "audio.metadata"), true);
    socket.emit("message", audioPacket(bytes.subarray(0, 7)), true);
    socket.emit("message", audioPacket(bytes.subarray(7)), true);
    socket.emit("message", Buffer.from("Path:turn.end\r\n"), false);
    await expect(request).resolves.toEqual(bytes);
  });
  it.each([Buffer.alloc(0), Buffer.from("<html>provider error</html>"), mp3().subarray(0, 287)])("rejects empty, non-MP3 and truncated completed audio", async bytes => {
    const request = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-BasselNeural");
    end(wire.sockets[0]!, bytes);
    await expect(request).rejects.toMatchObject({ reason: "invalid_audio" });
    expect(wire.sockets).toHaveLength(1);
  });
  it("rejects malformed or oversized frames and a socket closed before turn.end", async () => {
    for (const payload of [Buffer.from([0]), Buffer.from([0, 255, 1]), audioPacket(Buffer.alloc(2 * 1024 * 1024 + 1))]) {
      const request = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-BasselNeural");
      wire.sockets.at(-1)!.emit("message", payload, true);
      await expect(request).rejects.toMatchObject({ reason: "invalid_audio" });
    }
    const request = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-BasselNeural"), socket = wire.sockets.at(-1)!;
    socket.emit("message", audioPacket(mp3()), true); socket.emit("close", 1006);
    await expect(request).rejects.toMatchObject({ reason: "provider_closed" });
  });
  it("bounds a hanging provider and clears the socket", async () => {
    vi.useFakeTimers();
    const request = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-BasselNeural");
    const failure = expect(request).rejects.toMatchObject({ reason: "provider_timeout" });
    await vi.advanceTimersByTimeAsync(25000); await failure;
    expect(wire.sockets[0]!.terminate).toHaveBeenCalledOnce();
  });
  it("corrects the token clock once from HTTPS provider Date without changing the chosen voice", async () => {
    vi.useFakeTimers(); const now = Date.UTC(2026, 9, 13, 8); vi.setSystemTime(now);
    const request = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-RanaNeural"), resume = vi.fn();
    wire.sockets[0]!.emit("unexpected-response", {}, { statusCode: 403, headers: { date: new Date(now - 600000).toUTCString() }, resume });
    await Promise.resolve(); await Promise.resolve();
    expect(wire.sockets).toHaveLength(2); expect(resume).toHaveBeenCalledOnce();
    const socket = wire.sockets[1]!;
    expect(new URL(socket.url).searchParams.get("Sec-MS-GEC")).toBe(speechServiceHash(now - 600000));
    socket.readyState = 1; socket.emit("open"); expect(String(socket.send.mock.calls[1]![0])).toContain("ar-IQ-RanaNeural");
    end(socket); await expect(request).resolves.toEqual(mp3());
  });
  it("does not loop after a second 403 or retry unrelated provider statuses", async () => {
    const rejected = { statusCode: 403, headers: { date: new Date().toUTCString() }, resume: vi.fn() };
    const request = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-BasselNeural");
    wire.sockets[0]!.emit("unexpected-response", {}, rejected);
    await Promise.resolve(); await Promise.resolve();
    wire.sockets[1]!.emit("unexpected-response", {}, rejected);
    await expect(request).rejects.toMatchObject({ reason: "provider_rejected", providerStatus: 403 });
    expect(wire.sockets).toHaveLength(2);
    const failed = synthesizeAcademicSpeech("ملخص أكاديمي", "ar-IQ-BasselNeural");
    wire.sockets[2]!.emit("unexpected-response", {}, { ...rejected, statusCode: 500 });
    await expect(failed).rejects.toMatchObject({ providerStatus: 500 }); expect(wire.sockets).toHaveLength(3);
  });
  it("reports safe, actionable readiness reasons without provider URLs or source text", async () => {
    const result = probeAcademicSpeech();
    wire.sockets[0]!.emit("error", new Error("private transport details")); end(wire.sockets[1]!);
    const voices = await result;
    expect(voices).toEqual([{ voice: "ar-IQ-BasselNeural", ready: false, bytes: 0, reason: "transport_error" }, { voice: "ar-IQ-RanaNeural", ready: true, bytes: 288 }]);
    expect(JSON.stringify(voices)).not.toContain("private");
  });
  it("rejects invalid/control-character text before opening a socket", async () => {
    await expect(synthesizeAcademicSpeech("نص\u0000", "ar-IQ-RanaNeural")).rejects.toBeInstanceOf(AcademicSpeechUnavailable);
    expect(wire.sockets).toHaveLength(0);
  });
});

describe("MP3 validation", () => {
  it("accepts consecutive frames after an ID3 tag and rejects malformed tag sizes", () => {
    const tag = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 3, 0, 0, 0]);
    expect(isAcademicMp3(Buffer.concat([tag, mp3()]))).toBe(true);
    tag[6] = 255; expect(isAcademicMp3(Buffer.concat([tag, mp3()]))).toBe(false);
    expect(isAcademicMp3(Buffer.from("ID3"))).toBe(false);
    const badHeader = mp3(); badHeader[1] = 0xfb; expect(isAcademicMp3(badHeader)).toBe(false);
    expect(isAcademicMp3(Buffer.concat([mp3(), mp3().subarray(0, 143)]))).toBe(false);
    const footer = Buffer.alloc(128); footer.write("TAG");
    expect(isAcademicMp3(Buffer.concat([mp3(), footer]))).toBe(true);
  });
});
