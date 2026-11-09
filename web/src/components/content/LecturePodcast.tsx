"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StudyModuleLecture, StudySummaryDocument } from "@digital-leadership/shared";
import { loadLecturePodcast, StudyContentError } from "./subjectSummaryData";
import styles from "./SubjectSummaries.module.css";

type Voice = StudySummaryDocument["voices"][number];
type Playback = { kind: "idle" | "preparing" } | { kind: "ready"; url: string } | { kind: "error"; message: string; changed: boolean };
const rates = [0.85, 1, 1.15, 1.25, 1.5];

function readPreferences(key: string, voices: Voice[]) {
  const fallback = { voice: voices[0].id, rate: 1 };
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!stored || typeof stored !== "object") return fallback;
    const value = stored as { voice?: unknown; rate?: unknown };
    return { voice: voices.some(voice => voice.id === value.voice) ? value.voice as string : fallback.voice,
      rate: typeof value.rate === "number" && rates.includes(value.rate) ? value.rate : 1 };
  } catch { return fallback; }
}

export function LecturePodcast({ subjectId, lecture, voices, onRefreshSummary }: {
  subjectId: string; lecture: StudyModuleLecture; voices: Voice[]; onRefreshSummary: () => void;
}) {
  const preferenceKey = `digital-leadership:podcast:${subjectId}:${lecture.lectureId}:${lecture.summarySha256}`;
  const [preferences, setPreferences] = useState(() => readPreferences(preferenceKey, voices));
  const [playback, setPlayback] = useState<Playback>({ kind: "idle" });
  const [preparingMessage, setPreparingMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [canSeek, setCanSeek] = useState(false);
  const [needsPlayGesture, setNeedsPlayGesture] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const startWhenReady = useRef(false);
  const sourceUrl = playback.kind === "ready" ? playback.url : null;
  const voiceLabel = voices.find(voice => voice.id === preferences.voice)!.label;

  const cancel = useCallback(() => {
    generation.current++;
    request.current?.abort();
    audio.current?.pause();
    startWhenReady.current = false;
  }, []);

  useEffect(() => cancel, [cancel]);
  useEffect(() => sourceUrl ? () => URL.revokeObjectURL(sourceUrl) : undefined, [sourceUrl]);
  useEffect(() => {
    const element = audio.current;
    if (!sourceUrl || !element) return;
    element.playbackRate = preferences.rate;
    if (!startWhenReady.current) return;
    startWhenReady.current = false;
    const active = generation.current;
    element.play().catch(error => {
      if (active !== generation.current) return;
      if (error && typeof error === "object" && "name" in error && error.name === "NotAllowedError") setNeedsPlayGesture(true);
      else setPlayback({ kind: "error", message: "تعذر تشغيل التسجيل. أعد المحاولة أو اختر صوتًا آخر.", changed: false });
    });
  }, [sourceUrl, preferences.rate]);

  function updatePreferences(next: typeof preferences) {
    setPreferences(next);
    try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* Playback remains usable without local preferences. */ }
  }

  async function playPodcast() {
    cancel();
    const active = generation.current;
    const controller = new AbortController(); request.current = controller;
    setPlaying(false); setCanSeek(false); setNeedsPlayGesture(false);
    setPreparingMessage("جارٍ تجهيز تسجيل هذه المحاضرة…"); setPlayback({ kind: "preparing" });
    try {
      const blob = await loadLecturePodcast(lecture, preferences.voice, controller.signal, () => {
        if (active === generation.current) setPreparingMessage("جارٍ تجهيز التسجيل لأول مرة. يمكنك إلغاء الانتظار والمحاولة لاحقًا.");
      });
      if (controller.signal.aborted || active !== generation.current) return;
      const url = URL.createObjectURL(blob);
      startWhenReady.current = true;
      setPlayback({ kind: "ready", url });
    } catch (error) {
      if (controller.signal.aborted || active !== generation.current) return;
      setPlayback({ kind: "error", message: error instanceof StudyContentError ? error.message : "تعذر تحميل التسجيل. أعد المحاولة أو اختر صوتًا آخر.", changed: error instanceof StudyContentError && error.code === "changed" });
    }
  }

  function changeVoice(value: string) {
    cancel(); setPlayback({ kind: "idle" }); setPlaying(false); setCanSeek(false); setNeedsPlayGesture(false);
    updatePreferences({ ...preferences, voice: value });
  }

  function seek(seconds: number) {
    const element = audio.current;
    if (canSeek && element && Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + seconds));
  }

  const status = playback.kind === "error" ? playback.message : playback.kind === "preparing" ? preparingMessage
    : playback.kind === "ready" ? needsPlayGesture ? "التسجيل جاهز. اضغط زر التشغيل في المشغّل للاستماع." : playing ? `تستمع الآن بصوت ${voiceLabel}.` : "التسجيل جاهز للاستماع."
      : "اختر الصوت ثم شغّل بودكاست هذه المحاضرة.";

  return <aside className={styles.podcast} aria-label={`بودكاست ${lecture.title}`}>
    <h3>استمع إلى ملخص المحاضرة</h3>
    <p className={styles.helper}>يقرأ التسجيل نص الملخص نفسه، مع فواصل بين محاوره.</p>
    <label className={styles.field} htmlFor={`voice-${lecture.id}`}>
      <span>الصوت واللهجة</span>
      <select id={`voice-${lecture.id}`} value={preferences.voice} onChange={event => changeVoice(event.target.value)}>
        {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
      </select>
    </label>
    {playback.kind === "preparing" ? <button type="button" className={styles.secondaryButton} onClick={() => { cancel(); setPlayback({ kind: "idle" }); }}>إلغاء تجهيز التسجيل</button>
      : playback.kind !== "ready" ? <button type="button" className={styles.primaryButton} onClick={playPodcast}>{playback.kind === "error" ? "إعادة تجهيز البودكاست" : "تشغيل البودكاست"}</button> : null}
    {sourceUrl ? <audio key={sourceUrl} ref={audio} controls preload="metadata" src={sourceUrl} aria-label={`تسجيل ${lecture.title}`}
      onPlaying={() => { setPlaying(true); setNeedsPlayGesture(false); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onLoadedMetadata={event => setCanSeek(Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0)}
      onError={() => setPlayback({ kind: "error", message: "تعذر تشغيل التسجيل. أعد المحاولة أو اختر صوتًا آخر.", changed: false })} /> : null}
    <div className={styles.seekButtons}>
      <button type="button" className={styles.secondaryButton} disabled={!canSeek} onClick={() => seek(-15)}>رجوع ١٥ ثانية</button>
      <button type="button" className={styles.secondaryButton} disabled={!canSeek} onClick={() => seek(15)}>تقديم ١٥ ثانية</button>
    </div>
    <label className={styles.field} htmlFor={`rate-${lecture.id}`}><span>سرعة الاستماع</span>
      <select id={`rate-${lecture.id}`} value={preferences.rate} onChange={event => updatePreferences({ ...preferences, rate: Number(event.target.value) })}>
        {rates.map(rate => <option key={rate} value={rate}>{new Intl.NumberFormat("ar-IQ").format(rate)} ×{rate === 1 ? " — طبيعية" : ""}</option>)}
      </select>
    </label>
    <p className={`${styles.audioStatus} ${playback.kind === "error" ? styles.errorText : ""}`} role="status" aria-live="polite">{status}</p>
    {sourceUrl ? <a className={styles.secondaryButton} href={sourceUrl} download={`${lecture.title}-${preferences.voice}.mp3`}>تحميل البودكاست</a> : null}
    {playback.kind === "error" && playback.changed ? <button type="button" className={styles.secondaryButton} onClick={onRefreshSummary}>تحديث الملخص</button> : null}
    <a className={styles.textLink} href={`#summary-text-${lecture.number}`}>قراءة نص الملخص</a>
  </aside>;
}
