"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeArabicVoice, shapeAcademicArabic, sortAcademicVoices, speechChunks, type AcademicVoiceDescriptor } from "@digital-leadership/shared";
import type { ExamAudioChapter } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./examMaterial.module.css";

type PlaybackEntry = { text: string; chapterId: string; title: string; pauseAfterMs: number; kind: "heading" | "body" };

type VoiceOption = AcademicVoiceDescriptor & { voice: SpeechSynthesisVoice };

function buildEntries(chapters: ExamAudioChapter[]): PlaybackEntry[] {
  return chapters.flatMap(chapter => {
    if (chapter.segments?.length) {
      return chapter.segments.flatMap(segment => {
        const chunks = speechChunks(segment.text);
        return chunks.map((text, index) => ({ text, chapterId: chapter.id, title: chapter.title, pauseAfterMs: index === chunks.length - 1 ? segment.pauseAfterMs : 0, kind: segment.kind }));
      });
    }
    return chapter.chunks.map((text, index) => ({ text, chapterId: chapter.id, title: chapter.title, pauseAfterMs: index === chapter.chunks.length - 1 ? 500 : 0, kind: "body" as const }));
  });
}

/** Browser Arabic narration adapter. It uses only voices actually exposed by the device/browser. */
export function ExamAudioPlayer({ chapters }: { chapters: ExamAudioChapter[] }) {
  const entries = buildEntries(chapters);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"stopped" | "playing" | "paused">("stopped");
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(0.9);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackIndex = useRef(0);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNextIndex = useRef<number | null>(null);
  const state = useRef({ entries, rate, voiceId, voices });

  useEffect(() => { state.current = { entries, rate, voiceId, voices }; }, [entries, rate, voiceId, voices]);

  useEffect(() => {
    const engine = typeof window !== "undefined" && typeof window.speechSynthesis?.speak === "function" && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null;
    let mounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const readVoices = () => {
      if (!mounted) return;
      setSupported(Boolean(engine));
      if (!engine) return;
      const arabic = sortAcademicVoices(engine.getVoices()
        .filter(voice => /^ar(?:-|_|$)/i.test(voice.lang))
        .map(voice => ({ ...describeArabicVoice(voice.name, voice.voiceURI, voice.lang, voice.localService), voice })));
      setVoices(arabic);
      setVoiceId(current => arabic.some(item => item.voice.voiceURI === current) ? current : arabic[0]?.voice.voiceURI ?? "");
    };
    // Chromium/Safari often return [] on the first call and populate voices later.
    readVoices();
    [100, 500, 1500, 3000].forEach(delay => timers.push(setTimeout(readVoices, delay)));
    engine?.addEventListener("voiceschanged", readVoices);
    return () => {
      mounted = false; timers.forEach(clearTimeout); engine?.removeEventListener("voiceschanged", readVoices); engine?.cancel();
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      generation.current++;
    };
  }, []);

  const clearGap = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
    pendingNextIndex.current = null;
  }, []);

  function stop() {
    generation.current++;
    clearGap();
    utterance.current = null;
    if (supported) window.speechSynthesis.cancel();
    setStatus("stopped");
  }

  function speak(index: number, session: number) {
    if (session !== generation.current) return;
    const entry = state.current.entries[index];
    if (!entry) { setStatus("stopped"); playbackIndex.current = 0; setPosition(0); return; }
    const voice = state.current.voices.find(item => item.voice.voiceURI === state.current.voiceId)?.voice;
    if (!voice) { setStatus("stopped"); setError("اختر صوتًا عربيًا متاحًا على جهازك."); return; }
    playbackIndex.current = index; setPosition(index);
    const audio = new SpeechSynthesisUtterance(shapeAcademicArabic(entry.text));
    audio.lang = voice.lang; audio.voice = voice; audio.rate = state.current.rate;
    audio.onend = () => {
      if (session !== generation.current) return;
      const next = index + 1;
      if (!state.current.entries[next]) { setStatus("stopped"); return; }
      const pause = Math.max(0, entry.pauseAfterMs);
      if (!pause) { speak(next, session); return; }
      pendingNextIndex.current = next;
      pauseTimer.current = setTimeout(() => { pauseTimer.current = null; pendingNextIndex.current = null; speak(next, session); }, pause);
    };
    audio.onerror = event => {
      if (session !== generation.current || ["canceled", "interrupted"].includes(event.error)) return;
      setStatus("stopped"); setError("تعذر تشغيل القراءة الصوتية. يمكنك المحاولة مجددًا أو اختيار صوت آخر.");
    };
    utterance.current = audio; window.speechSynthesis.speak(audio);
  }

  function play() {
    if (!supported || !voiceId || !entries.length) return;
    setError(null);
    if (status === "paused") {
      setStatus("playing");
      if (pendingNextIndex.current !== null) {
        const next = pendingNextIndex.current; clearGap(); speak(next, generation.current);
      } else window.speechSynthesis.resume();
      return;
    }
    stop(); setStatus("playing"); window.speechSynthesis.resume(); speak(playbackIndex.current, generation.current);
  }

  function pause() {
    if (pauseTimer.current && status === "playing") {
      clearTimeout(pauseTimer.current); pauseTimer.current = null; setStatus("paused"); return;
    }
    window.speechSynthesis.pause(); setStatus("paused");
  }

  function seek(index: number) { stop(); playbackIndex.current = index; setPosition(index); setError(null); }
  function changeRate(value: number) { stop(); setRate(value); }
  const minutes = Math.max(1, Math.ceil(entries.reduce((sum, entry) => sum + entry.text.split(/\s+/).length, 0) / (140 * rate)));
  const active = entries[position];

  return <section className={styles.audioPlayer} aria-label="بودكاست المراجعة الصوتية">
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>استمع إلى الملخص</span><h3><PlatformIcon name="headphones" /> بودكاست المراجعة</h3></div><span className={styles.badge}>نحو {minutes} دقيقة</span></div>
    <p className={styles.muted}>قراءة صوتية عربية بنبرة أكاديمية رصينة، مع فواصل زمنية فعلية بين العناوين والمحاور، باستخدام الأصوات العربية المثبتة والمتاحة في جهازك.</p>
    <div className={styles.audioControls}>
      <button type="button" className={styles.action} disabled={!supported || !voiceId || !entries.length} onClick={status === "playing" ? pause : play}><PlatformIcon name={status === "playing" ? "pause" : "play"} />{status === "playing" ? "إيقاف مؤقت" : status === "paused" ? "استئناف" : "تشغيل المراجعة"}</button>
      <button type="button" className={styles.quiet} disabled={status === "stopped"} onClick={stop}>إيقاف</button>
      <label>السرعة<select value={rate} onChange={event => changeRate(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      <label>الصوت العربي<select aria-label="الصوت العربي" value={voiceId} disabled={!voices.length} onChange={event => { stop(); setVoiceId(event.target.value); }}>{voices.length ? voices.map(profile => <option key={profile.voice.voiceURI} value={profile.voice.voiceURI}>{profile.label} — {profile.region} — {profile.gender}</option>) : <option value="">لا يوجد صوت عربي متاح</option>}</select></label>
    </div>
    {supported === false || supported === true && !voices.length ? <p className={styles.notice} role="status">{supported === false ? "هذا المتصفح لا يدعم القراءة الصوتية. يمكنك قراءة الملخص أو تنزيل حزمة المراجعة." : "لا يتوفر صوت عربي حالياً. ثبّت حزمة صوت عربية في إعدادات الجهاز، ثم أعد تحميل الصفحة."}</p> : null}
    {voices.length === 1 ? <p className={styles.notice} role="status">يظهر صوت عربي واحد فقط لأن المتصفح لم يحمّل أصواتًا عربية أخرى من الجهاز.</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <label className={styles.audioSeek}>موضع المراجعة <span>{position + 1} / {entries.length}</span><input aria-label="موضع المراجعة الصوتية" type="range" min="0" max={Math.max(0, entries.length - 1)} value={position} disabled={!entries.length} onChange={event => seek(Number(event.target.value))} /></label>
    <div className={styles.audioChapterList} aria-label="فصول المراجعة">{chapters.map(chapter => <button type="button" key={chapter.id} className={styles.quiet} aria-pressed={active?.chapterId === chapter.id} onClick={() => { const first = entries.findIndex(entry => entry.chapterId === chapter.id); const body = entries.map((entry, index) => ({ entry, index })).filter(item => item.entry.chapterId === chapter.id && item.entry.kind === "body").at(-1)?.index ?? first; seek(body); }}>{chapter.title}</button>)}</div>
    {active ? <details className={styles.audioTranscript}><summary>النص في الموضع الحالي</summary><p>{active.text}</p></details> : null}
    <span className={styles.srOnly} role="status">{status === "playing" ? "المراجعة الصوتية قيد التشغيل" : status === "paused" ? "تم إيقاف القراءة مؤقتاً" : "المشغل متوقف"}</span>
  </section>;
}
