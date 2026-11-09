import { createHash } from "node:crypto";
import { ACADEMIC_NARRATION_VERSION, type AcademicVoiceId } from "@digital-leadership/shared";
import { AcademicSpeechUnavailable, isAcademicMp3 } from "../examMaterials/academicSpeech.js";

interface NarrationIdentity {
  subjectId: string;
  lectureId: string;
  sourceRevision: string;
  summaryRevision: string;
  voice: AcademicVoiceId;
}
interface NarrationAudio { bytes: Buffer; voice: AcademicVoiceId }
type CachedNarration = { expires: number } & ({ audio: NarrationAudio } | { error: unknown });

/** Call only after checking current lecture visibility, source bytes and
 * transcript revision. A cached recording never grants access to its source. */
export class CourseNarrationCache {
  private readonly cache = new Map<string, CachedNarration>();
  private readonly pending = new Map<string, Promise<NarrationAudio>>();
  private cachedBytes = 0;
  private preparingBytes = 0;
  // Match the segment cache's 32 MiB/six-request budgets and six-hour TTL.
  // The byte budget also bounds all unfinished lecture assemblies together.
  // Keep at most as many outcomes as the existing 64-entry lecture compiler.
  constructor(private readonly maxBytes = 32 * 1024 * 1024, private readonly maxPending = 6, private readonly ttl = 6 * 60 * 60 * 1000, private readonly maxEntries = 64) {}

  audio(identity: NarrationIdentity, prepare: (append: (bytes: Buffer) => void) => Promise<void>): Promise<NarrationAudio> {
    const key = createHash("sha256").update(JSON.stringify([ACADEMIC_NARRATION_VERSION, identity.subjectId, identity.lectureId, identity.sourceRevision, identity.summaryRevision, identity.voice])).digest("hex");
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      if ("error" in cached) return Promise.reject(cached.error);
      this.cache.delete(key); this.cache.set(key, cached);
      return Promise.resolve(cached.audio);
    }
    if (cached) this.remove(key);
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    if (this.pending.size >= this.maxPending) return Promise.reject(new AcademicSpeechUnavailable("capacity"));

    const parts: Buffer[] = []; let length = 0;
    const append = (bytes: Buffer) => {
      if (this.preparingBytes + bytes.length > this.maxBytes) throw new AcademicSpeechUnavailable("capacity");
      parts.push(bytes); length += bytes.length; this.preparingBytes += bytes.length;
    };
    const work = Promise.resolve().then(() => prepare(append)).then(() => {
      const bytes = Buffer.concat(parts, length);
      if (!isAcademicMp3(bytes)) throw new AcademicSpeechUnavailable("invalid_audio");
      const audio = { bytes, voice: identity.voice };
      this.remember(key, { audio, expires: Date.now() + this.ttl });
      return audio;
    }).catch((error: unknown) => {
      // A provider can fail after the caller received audio_preparing. Retain
      // that outcome for the existing one-minute audio rate-limit window so
      // its retry receives the failure instead of starting another cold job.
      this.remember(key, { error, expires: Date.now() + 60_000 });
      throw error;
    }).finally(() => {
      this.preparingBytes -= length; parts.length = 0; this.pending.delete(key);
    });
    this.pending.set(key, work);
    return work;
  }

  private remove(key: string) {
    const entry = this.cache.get(key);
    if (entry && "audio" in entry) this.cachedBytes -= entry.audio.bytes.length;
    this.cache.delete(key);
  }
  private remember(key: string, entry: CachedNarration) {
    const bytes = "audio" in entry ? entry.audio.bytes.length : 0;
    while (this.cache.size && (this.cache.size >= this.maxEntries || this.cachedBytes + bytes > this.maxBytes)) this.remove(this.cache.keys().next().value!);
    this.cache.set(key, entry); this.cachedBytes += bytes;
  }
}

export const courseNarrationCache = new CourseNarrationCache();
