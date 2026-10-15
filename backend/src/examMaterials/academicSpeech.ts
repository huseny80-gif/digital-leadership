import { createHash, randomBytes } from "node:crypto";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ACADEMIC_NARRATION_VERSION, ACADEMIC_VOICES, type AcademicVoiceId } from "@digital-leadership/shared";

// Public Read Aloud client identifier, not an account credential. This adapter
// follows the Edge Read Aloud protocol; no learner cookie reaches the provider.
const CLIENT_ID = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CLIENT_VERSION = "143.0.3650.75";
// Edge moved synthesis here in October 2026. The old Bing voice-list host
// still answers catalog requests, but rejects synthesis handshakes with 403.
const SPEECH_ENDPOINT = "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1";
export const SPEECH_AUDIO_FORMAT = "audio-24khz-96kbitrate-mono-mp3";
type SpeechFailure = "invalid_request" | "transport_error" | "provider_rejected" | "provider_closed" | "provider_timeout" | "invalid_audio" | "capacity";
export class AcademicSpeechUnavailable extends Error {
  constructor(readonly reason: SpeechFailure = "transport_error", readonly providerStatus?: number, readonly providerDate?: number) {
    super("Academic narration is temporarily unavailable");
  }
}

export function speechServiceHash(now = Date.now()): string {
  const seconds = Math.floor((now / 1000 + 11644473600) / 300) * 300;
  const ticks = BigInt(seconds) * 10000000n;
  return createHash("sha256").update(`${ticks}${CLIENT_ID}`).digest("hex").toUpperCase();
}
const xml = (text: string) => text.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[value]!);
export function academicSpeechSsml(text: string, voiceId: AcademicVoiceId): string {
  const voice = ACADEMIC_VOICES.find(item => item.id === voiceId);
  const hasControl = [...text].some(character => { const code = character.charCodeAt(0); return code < 32 && ![9, 10, 13].includes(code); });
  if (!voice || !text.trim() || text.length > 2500 || hasControl) throw new AcademicSpeechUnavailable("invalid_request");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.locale}"><voice name="${voice.id}"><prosody pitch="+0Hz" rate="+0%" volume="+0%">${xml(text)}</prosody></voice></speak>`;
}

/** Neural synthesized narration, not a recording made by a real person. */
export async function synthesizeAcademicSpeech(text: string, voiceId: AcademicVoiceId): Promise<Buffer> {
  const ssml = academicSpeechSsml(text, voiceId);
  try { return await synthesizeOnce(ssml); }
  catch (error) {
    // Correct the protocol token once using the provider's HTTPS Date. This
    // never retries a rejected request indefinitely or changes the person.
    if (error instanceof AcademicSpeechUnavailable && error.providerStatus === 403 && error.providerDate !== undefined) {
      return synthesizeOnce(ssml, error.providerDate - Date.now());
    }
    throw error;
  }
}

function synthesizeOnce(ssml: string, clockSkewMs = 0): Promise<Buffer> {
  const id = randomBytes(16).toString("hex");
  const url = `${SPEECH_ENDPOINT}?Ocp-Apim-Subscription-Key=${CLIENT_ID}&ConnectionId=${id}&Sec-MS-GEC=${speechServiceHash(Date.now() + clockSkewMs)}&Sec-MS-GEC-Version=1-${CLIENT_VERSION}`;
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}), handshakeTimeout: 10_000, maxPayload: 2 * 1024 * 1024,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0", Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold", "Cache-Control": "no-cache", Pragma: "no-cache", "Accept-Language": "en-US,en;q=0.9", Cookie: `muid=${randomBytes(16).toString("hex").toUpperCase()};` },
    });
    const buffers: Buffer[] = []; let length = 0; let finished = false;
    const finish = (error?: AcademicSpeechUnavailable) => {
      if (finished) return; finished = true; clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN) socket.close(); else socket.terminate();
      const bytes = Buffer.concat(buffers);
      if (!error && isAcademicMp3(bytes)) resolve(bytes); else reject(error ?? new AcademicSpeechUnavailable("invalid_audio"));
    };
    const timeout = setTimeout(() => finish(new AcademicSpeechUnavailable("provider_timeout")), 25_000);
    socket.on("error", () => finish(new AcademicSpeechUnavailable("transport_error")));
    socket.on("close", () => finish(new AcademicSpeechUnavailable("provider_closed")));
    socket.on("unexpected-response", (_request, response) => {
      const date = Date.parse(String(response.headers.date ?? ""));
      response.resume();
      finish(new AcademicSpeechUnavailable("provider_rejected", response.statusCode, Number.isFinite(date) ? date : undefined));
    });
    socket.on("open", () => {
      const stamp = new Date().toString();
      const config = { context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: SPEECH_AUDIO_FORMAT } } } };
      socket.send(`X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}\r\n`);
      // The Read Aloud SSML message requires this trailing Z (unlike config).
      socket.send(`X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}Z\r\nPath:ssml\r\n\r\n${ssml}`);
    });
    socket.on("message", (raw, binary) => {
      const data = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as Buffer);
      if (!binary) { if (/^Path:turn\.end\r?$/m.test(data.toString())) finish(); return; }
      if (data.length < 2) { finish(new AcademicSpeechUnavailable("invalid_audio")); return; }
      const headerLength = data.readUInt16BE(0);
      if (headerLength + 2 > data.length) { finish(new AcademicSpeechUnavailable("invalid_audio")); return; }
      const header = data.subarray(2, headerLength + 2).toString();
      if (!/^Path:audio\r?$/m.test(header)) return;
      const audio = data.subarray(headerLength + 2); length += audio.length;
      if (length > 2 * 1024 * 1024) { finish(new AcademicSpeechUnavailable("invalid_audio")); return; }
      buffers.push(audio);
    });
  });
}

/** Reject an empty, HTML/error or truncated response before caching it or
 * handing it to Safari. Require two complete consecutive MPEG Layer III
 * frames and verify the remaining frames; accept an optional ID3 tag without
 * trusting its claimed length. */
export function isAcademicMp3(bytes: Buffer): boolean {
  let offset = 0;
  if (bytes.subarray(0, 3).toString("ascii") === "ID3") {
    if (bytes.length < 10 || bytes.subarray(6, 10).some(value => value > 127)) return false;
    offset = 10 + ((bytes[6]! << 21) | (bytes[7]! << 14) | (bytes[8]! << 7) | bytes[9]!) + (bytes[5]! & 0x10 ? 10 : 0);
  }
  let frames = 0;
  while (offset < bytes.length) {
    if (frames >= 2 && bytes.length - offset === 128 && bytes.subarray(offset, offset + 3).toString("ascii") === "TAG") return true;
    if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xe0) !== 0xe0) return false;
    const version = (bytes[offset + 1]! >> 3) & 3, layer = (bytes[offset + 1]! >> 1) & 3;
    const bitrate = bytes[offset + 2]! >> 4, sample = (bytes[offset + 2]! >> 2) & 3, padding = (bytes[offset + 2]! >> 1) & 1;
    if (version === 1 || layer !== 1 || !bitrate || bitrate === 15 || sample === 3) return false;
    const kbps = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrate]!;
    const hz = [44100, 48000, 32000][sample]! / (version === 3 ? 1 : version === 2 ? 2 : 4);
    offset += Math.floor((version === 3 ? 144000 : 72000) * kbps / hz) + padding;
    if (offset > bytes.length) return false;
    frames++;
  }
  return frames >= 2;
}

type Synthesizer = (text: string, voice: AcademicVoiceId) => Promise<Buffer>;
/** Bounded, content-addressed cache. Authorization happens before every call. */
export class AcademicSpeechCache {
  private readonly cache = new Map<string, { bytes: Buffer; expires: number }>();
  private readonly pending = new Map<string, Promise<Buffer>>();
  private size = 0;
  constructor(private readonly synthesize: Synthesizer = synthesizeAcademicSpeech, private readonly maxBytes = 32 * 1024 * 1024, private readonly ttl = 6 * 60 * 60 * 1000) {}
  async audio(text: string, voice: AcademicVoiceId): Promise<Buffer> {
    const key = createHash("sha256").update(`${ACADEMIC_NARRATION_VERSION}\0${voice}\0${text}`).digest("hex");
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) { this.cache.delete(key); this.cache.set(key, cached); return cached.bytes; }
    if (cached) { this.cache.delete(key); this.size -= cached.bytes.length; }
    const inflight = this.pending.get(key); if (inflight) return inflight;
    if (this.pending.size >= 6) throw new AcademicSpeechUnavailable("capacity");
    const request = this.synthesize(text, voice).then(bytes => {
      if (!bytes.length) throw new AcademicSpeechUnavailable("invalid_audio");
      while (this.cache.size && this.size + bytes.length > this.maxBytes) {
        const oldest = this.cache.keys().next().value!; this.size -= this.cache.get(oldest)!.bytes.length; this.cache.delete(oldest);
      }
      if (bytes.length <= this.maxBytes) { this.cache.set(key, { bytes, expires: Date.now() + this.ttl }); this.size += bytes.length; }
      return bytes;
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, request); return request;
  }
}
export const academicSpeechCache = new AcademicSpeechCache();

/** Verify network reachability after production starts, using only a fixed
 * public sentence. No lecture content, learner identity or credentials. */
export async function probeAcademicSpeech() {
  return Promise.all(ACADEMIC_VOICES.filter(voice => voice.locale === "ar-IQ").map(async voice => {
    try {
      const audio = await synthesizeAcademicSpeech("منصة القِيادَة الرَّقْمِيَّة.\n\nمُراجَعَة أكاديمية.\n\nحَوْكَمَة المَخاطِر.", voice.id);
      return { voice: voice.id, ready: true, bytes: audio.length };
    } catch (error) {
      return { voice: voice.id, ready: false, bytes: 0, reason: error instanceof AcademicSpeechUnavailable ? error.reason : "transport_error", ...(error instanceof AcademicSpeechUnavailable && error.providerStatus ? { providerStatus: error.providerStatus } : {}) };
    }
  }));
}
