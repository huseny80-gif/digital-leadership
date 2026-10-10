"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExamAudioChapter } from "@shared/index";
import { ACADEMIC_VOICES, DEFAULT_ACADEMIC_VOICE, type AcademicVoiceId } from "@digital-leadership/shared";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./examMaterial.module.css";

const RATES = [0.9, 1, 1.1, 1.25, 1.5];
const PREFERENCES = "digital-leadership:academic-audio";
type Status = "stopped" | "playing" | "paused";
interface PauseGap { next: number; remaining: number; started: number; timer: ReturnType<typeof setTimeout> | null }

/** Neural narration with separate real voices, prepared academic text and
 * measured pauses, independent of installed device speech-synthesis voices. */
export function ExamAudioPlayer({ chapters, subjectId, groupId }: { chapters: ExamAudioChapter[]; subjectId: string; groupId: string }) {
  const entries = useMemo(() => chapters.flatMap(chapter => (chapter.segments ?? chapter.chunks.map(text => ({ kind: "body" as const, text, pauseAfterMs: 350 }))).map((segment, index) => ({ ...segment, index, chapterId: chapter.id, title: chapter.title }))), [chapters]);
  const [voiceId, setVoiceId] = useState<AcademicVoiceId>(DEFAULT_ACADEMIC_VOICE);
  const [rate, setRate] = useState(1.1);
  const [status, setStatus] = useState<Status>("stopped");
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const session = useRef(0);
  const desired = useRef<Status>("stopped");
  const index = useRef(0);
  const gap = useRef<PauseGap | null>(null);
  const sources = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, AbortController>());
  const current = useRef({ entries, voiceId, rate, subjectId, groupId });
  useEffect(() => { current.current = { entries, voiceId, rate, subjectId, groupId }; }, [entries, voiceId, rate, subjectId, groupId]);

  const release = useCallback(() => {
    session.current++; desired.current = "stopped";
    if (gap.current?.timer) clearTimeout(gap.current.timer); gap.current = null;
    pending.current.forEach(controller => controller.abort()); pending.current.clear();
    sources.current.forEach(url => URL.revokeObjectURL(url)); sources.current.clear();
    const player = audio.current;
    if (player) { player.onended = null; player.onerror = null; player.onplaying = null; player.onwaiting = null; player.pause(); player.removeAttribute("src"); player.load(); }
  }, []);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try {
        const prefs = JSON.parse(localStorage.getItem(PREFERENCES) ?? "null") as { voice?: string; rate?: number } | null;
        if (prefs && ACADEMIC_VOICES.some(voice => voice.id === prefs.voice)) setVoiceId(prefs.voice as AcademicVoiceId);
        if (prefs && RATES.includes(prefs.rate ?? 0)) setRate(prefs.rate!);
      } catch { /* Preferences are optional in private browsing. */ }
    });
    const player = audio.current;
    return () => { mounted = false; release(); player?.pause(); player?.removeAttribute("src"); player?.load(); };
  }, [release]);

  function urlFor(at: number) {
    const state = current.current, entry = state.entries[at];
    const query = new URLSearchParams({ chapter: entry!.chapterId, segment: String(entry!.index), voice: state.voiceId });
    return `/api/exam-material/${state.subjectId}/${state.groupId}/audio.mp3?${query}`;
  }
  function prefetch(at: number, token: number) {
    if (!current.current.entries[at] || typeof URL.createObjectURL !== "function") return;
    const url = urlFor(at); if (sources.current.has(url) || pending.current.has(url)) return;
    const controller = new AbortController(); pending.current.set(url, controller);
    void fetch(url, { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok || !response.headers.get("content-type")?.includes("audio/mpeg")) return;
      const blob = await response.blob(); if (token !== session.current || controller.signal.aborted || blob.size > 2 * 1024 * 1024) return;
      sources.current.set(url, URL.createObjectURL(blob));
      while (sources.current.size > 3) { const oldest = sources.current.keys().next().value!; URL.revokeObjectURL(sources.current.get(oldest)!); sources.current.delete(oldest); }
    }).catch(() => { /* The main player retries if prefetch fails. */ }).finally(() => { if (pending.current.get(url) === controller) pending.current.delete(url); });
  }
  function stop() { release(); setStatus("stopped"); setBuffering(false); }
  function finish() { stop(); index.current = 0; setPosition(0); }
  function fail(token: number, reason?: unknown) {
    if (token !== session.current || (reason instanceof DOMException && reason.name === "AbortError")) return;
    stop(); setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "اضغط تشغيل المراجعة للسماح بتشغيل الصوت." : "تعذر تشغيل الصوت مؤقتاً. أعد المحاولة أو اختر صوتًا آخر.");
  }
  function playAt(at: number, token: number) {
    if (token !== session.current || desired.current !== "playing") return;
    const entry = current.current.entries[at], player = audio.current;
    if (!entry || !player) { finish(); return; }
    gap.current = null; index.current = at; setPosition(at); setBuffering(true);
    player.onplaying = () => { if (token === session.current) { setBuffering(false); if (desired.current === "paused") player.pause(); } };
    player.onwaiting = () => { if (token === session.current) setBuffering(true); };
    player.onerror = () => fail(token);
    player.onended = () => {
      if (token !== session.current) return;
      setBuffering(false);
      if (!current.current.entries[at + 1]) { finish(); return; }
      gap.current = { next: at + 1, remaining: entry.pauseAfterMs, started: Date.now(), timer: null };
      if (desired.current === "playing") scheduleGap(token);
    };
    const url = urlFor(at); player.src = sources.current.get(url) ?? url;
    player.playbackRate = current.current.rate; player.preservesPitch = true; player.load();
    // Invoke synchronously in the click handler to preserve Safari's user
    // gesture; do not await generation before starting the media element.
    void player.play().catch(reason => fail(token, reason)); prefetch(at + 1, token);
  }
  function scheduleGap(token: number) {
    const pause = gap.current; if (!pause) return;
    if (pause.timer) clearTimeout(pause.timer);
    pause.started = Date.now(); pause.timer = setTimeout(() => { pause.timer = null; playAt(pause.next, token); }, pause.remaining);
  }
  function play() {
    if (!entries.length) return;
    setError(null); desired.current = "playing"; setStatus("playing");
    if (status === "paused") {
      if (gap.current) { scheduleGap(session.current); return; }
      const player = audio.current, token = session.current; if (player?.getAttribute("src")) { void player.play().catch(reason => fail(token, reason)); return; }
    }
    playAt(index.current, session.current);
  }
  function pause() {
    desired.current = "paused"; setStatus("paused");
    if (gap.current?.timer) { clearTimeout(gap.current.timer); gap.current.timer = null; gap.current.remaining = Math.max(0, gap.current.remaining - (Date.now() - gap.current.started)); }
    audio.current?.pause();
  }
  function seek(at: number) {
    const wasPlaying = desired.current === "playing"; stop(); index.current = at; setPosition(at); setError(null);
    if (wasPlaying) { desired.current = "playing"; setStatus("playing"); playAt(at, session.current); }
  }
  function preferences(voice: AcademicVoiceId, speed: number) {
    try { localStorage.setItem(PREFERENCES, JSON.stringify({ voice, rate: speed })); } catch { /* Optional. */ }
  }
  function chooseVoice(value: AcademicVoiceId) {
    const wasPlaying = desired.current === "playing"; stop(); current.current.voiceId = value; setVoiceId(value); setError(null); preferences(value, rate);
    if (wasPlaying) { desired.current = "playing"; setStatus("playing"); playAt(index.current, session.current); }
  }
  function chooseRate(value: number) { current.current.rate = value; setRate(value); if (audio.current) { audio.current.playbackRate = value; audio.current.preservesPitch = true; } preferences(voiceId, value); }
  const selectedVoice = ACADEMIC_VOICES.find(voice => voice.id === voiceId)!;
  const minutes = Math.max(1, Math.ceil(entries.reduce((sum, entry) => sum + entry.text.split(/\s+/).length / (155 * rate) + entry.pauseAfterMs / 60_000, 0)));
  const active = entries[position];

  return <section className={styles.audioPlayer} aria-label="بودكاست المراجعة الصوتية">
    <audio ref={audio} preload="none" aria-label="صوت المراجعة الأكاديمية" className={styles.hiddenAudio} />
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>استمع إلى الملخص</span><h3><PlatformIcon name="headphones" /> بودكاست المراجعة</h3></div><span className={styles.badge}>نحو {minutes} دقيقة</span></div>
    <p className={styles.muted}>إلقاء أكاديمي رزِين، ونطق واضح، وفواصل بين العناوين والمحاور.</p>
    <div className={styles.narrationBadges}><span>{selectedVoice.locale === "ar-IQ" ? "فصحى بلكنة عراقية" : `فصحى · صوت ${selectedVoice.country}`}</span><span>أصوات رجالية ونسائية</span></div>
    <div className={styles.audioControls}>
      <button type="button" className={styles.action} disabled={!entries.length} onClick={status === "playing" ? pause : play}><PlatformIcon name={status === "playing" ? "pause" : "play"} />{status === "playing" ? "إيقاف مؤقت" : status === "paused" ? "استئناف" : "تشغيل المراجعة"}</button>
      <button type="button" className={styles.quiet} disabled={status === "stopped"} onClick={stop}>إيقاف</button>
      <label>سرعة الإلقاء<select aria-label="سرعة الإلقاء" value={rate} onChange={event => chooseRate(Number(event.target.value))}>{RATES.map(value => <option key={value} value={value}>{value}×{value === 1.1 ? " · متوازن" : ""}</option>)}</select></label>
      <label>الصوت<select aria-label="الصوت العربي" value={voiceId} onChange={event => chooseVoice(event.target.value as AcademicVoiceId)}>{(["male", "female"] as const).map(gender => <optgroup key={gender} label={gender === "male" ? "أصوات رجالية" : "أصوات نسائية"}>{ACADEMIC_VOICES.filter(voice => voice.gender === gender).map(voice => <option key={voice.id} value={voice.id}>{voice.name} — {gender === "female" ? voice.country.replace(/ي$/, "ية") : voice.country} ({gender === "male" ? "رجل" : "امرأة"})</option>)}</optgroup>)}</select></label>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <p className={styles.audioStatus} role="status">{status === "stopped" ? "جاهز للاستماع" : status === "paused" ? "تم إيقاف المراجعة مؤقتًا" : buffering ? "جارٍ تجهيز الصوت…" : "المراجعة الصوتية قيد التشغيل"}</p>
    <label className={styles.audioSeek}>موضع المراجعة <span>{entries.length ? position + 1 : 0} / {entries.length}</span><input aria-label="موضع المراجعة الصوتية" type="range" min="0" max={Math.max(0, entries.length - 1)} value={position} disabled={!entries.length} onChange={event => seek(Number(event.target.value))} /></label>
    <div className={styles.audioChapterList} aria-label="فصول المراجعة">{chapters.map(chapter => <button type="button" key={chapter.id} className={styles.quiet} aria-pressed={active?.chapterId === chapter.id} onClick={() => { const at = entries.findIndex(entry => entry.chapterId === chapter.id); if (at >= 0) seek(at); }}>{chapter.title}</button>)}</div>
    {active ? <details className={styles.audioTranscript}><summary>النص المسموع في الموضع الحالي</summary><p>{active.text}</p></details> : null}
  </section>;
}
