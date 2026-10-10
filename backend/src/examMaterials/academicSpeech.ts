import { createHash, randomBytes } from "node:crypto";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ACADEMIC_NARRATION_VERSION, ACADEMIC_VOICES, type AcademicVoiceId } from "@digital-leadership/shared";

// Public Read Aloud client identifier, not an account credential. This adapter
// follows the Edge Read Aloud protocol; no learner cookie reaches the provider.
const CLIENT_ID = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CLIENT_VERSION = "143.0.3650.75";
const SPEECH_HOST = "speech.platform.bing.com";
export const SPEECH_AUDIO_FORMAT = "audio-24khz-96kbitrate-mono-mp3";
export class AcademicSpeechUnavailable extends Error { constructor() { super("Academic narration is temporarily unavailable"); } }

export function speechServiceHash(now = Date.now()): string {
  const seconds = Math.floor((now / 1000 + 11644473600) / 300) * 300;
  const ticks = BigInt(seconds) * 10000000n;
  return createHash("sha256").update(`${ticks}${CLIENT_ID}`).digest("hex").toUpperCase();
}
const xml = (text: string) => text.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[value]!);
export function academicSpeechSsml(text: string, voiceId: AcademicVoiceId): string {
  const voice = ACADEMIC_VOICES.find(item => item.id === voiceId);
  if (!voice || !text.trim() || text.length > 2500) throw new AcademicSpeechUnavailable();
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.locale}"><voice name="${voice.id}"><prosody pitch="+0Hz" rate="+0%" volume="+0%">${xml(text)}</prosody></voice></speak>`;
}

/** Actual neural MP3, never a pitch-shifted imitation of another person. */
export async function synthesizeAcademicSpeech(text: string, voiceId: AcademicVoiceId): Promise<Buffer> {
  const ssml = academicSpeechSsml(text, voiceId);
  const id = randomBytes(16).toString("hex");
  const url = `wss://${SPEECH_HOST}/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${CLIENT_ID}&ConnectionId=${id}&Sec-MS-GEC=${speechServiceHash()}&Sec-MS-GEC-Version=1-${CLIENT_VERSION}`;
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}), handshakeTimeout: 10_000, maxPayload: 2 * 1024 * 1024,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0", Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold", "Cache-Control": "no-cache", Pragma: "no-cache", Cookie: `muid=${randomBytes(16).toString("hex").toUpperCase()};` },
    });
    const buffers: Buffer[] = []; let length = 0; let finished = false;
    const finish = (valid: boolean) => {
      if (finished) return; finished = true; clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN) socket.close(); else socket.terminate();
      if (valid && length > 0) resolve(Buffer.concat(buffers)); else reject(new AcademicSpeechUnavailable());
    };
    const timeout = setTimeout(() => finish(false), 35_000);
    socket.on("error", () => finish(false)); socket.on("close", () => finish(false));
    socket.on("unexpected-response", (_request, response) => { response.resume(); finish(false); });
    socket.on("open", () => {
      const stamp = new Date().toString();
      const config = { context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: SPEECH_AUDIO_FORMAT } } } };
      socket.send(`X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}\r\n`);
      socket.send(`X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}\r\nPath:ssml\r\n\r\n${ssml}`);
    });
    socket.on("message", (raw, binary) => {
      const data = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as Buffer);
      if (!binary) { if (/^Path:turn\.end\r?$/m.test(data.toString())) finish(true); return; }
      if (data.length < 2) { finish(false); return; }
      const headerLength = data.readUInt16BE(0);
      if (headerLength + 2 > data.length) { finish(false); return; }
      const header = data.subarray(2, headerLength + 2).toString();
      if (!/^Path:audio\r?$/m.test(header)) return;
      const audio = data.subarray(headerLength + 2); length += audio.length;
      if (length > 2 * 1024 * 1024) { finish(false); return; }
      buffers.push(audio);
    });
  });
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
    if (this.pending.size >= 6) throw new AcademicSpeechUnavailable();
    const request = this.synthesize(text, voice).then(bytes => {
      if (!bytes.length) throw new AcademicSpeechUnavailable();
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
      const audio = await synthesizeAcademicSpeech("منصة القِيادَة الرَّقْمِيَّة. مُراجَعَة أكاديمية.", voice.id);
      return { voice: voice.id, ready: true, bytes: audio.length };
    } catch { return { voice: voice.id, ready: false, bytes: 0 }; }
  }));
}
