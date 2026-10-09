"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeArabicVoice, shapeAcademicArabic, sortAcademicVoices, type AcademicVoiceDescriptor } from "@digital-leadership/shared";
import type { ExamAudioChapter } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./examMaterial.module.css";

/** Selective diacritics improve TTS pronunciation without rewriting source text. */
function speechText(value: string): string { return shapeAcademicArabic(value); }

/** Browser Arabic narration adapter. No application AI request or fabricated
 * audio file is used; available device/browser voices supply the playback. */
export function ExamAudioPlayer({ chapters }: { chapters: ExamAudioChapter[] }) {
  const entries = chapters.flatMap(chapter => chapter.chunks.map(text => ({ text, chapterId: chapter.id, title: chapter.title })));
  const [voices, setVoices] = useState<Array<AcademicVoiceDescriptor & { voice: SpeechSynthesisVoice }>>([]);
  const [voiceId, setVoiceId] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"stopped" | "playing" | "paused">("stopped");
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(0.9);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const invalidatePlayback = useCallback(() => { generation.current++; }, []);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackIndex = useRef(0);
  const state = useRef({ entries, rate, voiceId, voices });

  useEffect(() => { state.current = { entries, rate, voiceId, voices }; }, [entries, rate, voiceId, voices]);
  useEffect(() => {
    const available = typeof window.speechSynthesis?.speak === "function" && typeof window.SpeechSynthesisUtterance === "function";
    const engine = available ? window.speechSynthesis : null;
    let mounted = true;
    const readVoices = () => {
      if (!mounted) return;
      setSupported(available);
      if (!engine) return;
      const arabic = sortAcademicVoices(engine.getVoices().filter(voice => /^ar(?:-|_|$)/i.test(voice.lang)).map(voice => ({ ...describeArabicVoice(voice.name, voice.voiceURI, voice.lang, voice.localService), voice })));
      setVoices(arabic); setVoiceId(current => arabic.some(item => item.voice.voiceURI === current) ? current : (arabic.find(item => item.voice.localService) ?? arabic[0])?.voice.voiceURI ?? "");
    };
    queueMicrotask(readVoices);
    engine?.addEventListener("voiceschanged", readVoices);
    return () => { mounted = false; invalidatePlayback(); engine?.removeEventListener("voiceschanged", readVoices); engine?.cancel(); };
  }, [invalidatePlayback]);

  function stop() {
    generation.current++; utterance.current = null;
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
    const audio = new SpeechSynthesisUtterance(speechText(entry.text));
    audio.lang = voice.lang; audio.voice = voice; audio.rate = state.current.rate;
    audio.onend = () => { if (session === generation.current) speak(index + 1, session); };
    audio.onerror = event => {
      if (session !== generation.current || ["canceled", "interrupted"].includes(event.error)) return;
      setStatus("stopped"); setError("تعذر تشغيل القراءة الصوتية. يمكنك المحاولة مجددًا أو اختيار صوت آخر.");
    };
    utterance.current = audio; window.speechSynthesis.speak(audio);
  }
  function play() {
    if (!supported || !voiceId || !entries.length) return;
    setError(null);
    if (status === "paused" && utterance.current) { window.speechSynthesis.resume(); setStatus("playing"); return; }
    stop(); setStatus("playing"); window.speechSynthesis.resume(); speak(playbackIndex.current, generation.current);
  }
  function seek(index: number) { stop(); playbackIndex.current = index; setPosition(index); setError(null); }
  function changeRate(value: number) { stop(); setRate(value); }
  const minutes = Math.max(1, Math.ceil(entries.reduce((sum, entry) => sum + entry.text.split(/\s+/).length, 0) / (140 * rate)));
  const active = entries[position];

  return <section className={styles.audioPlayer} aria-label="بودكاست المراجعة الصوتية">
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>استمع إلى الملخص</span><h3><PlatformIcon name="headphones" /> بودكاست المراجعة</h3></div><span className={styles.badge}>نحو {minutes} دقيقة</span></div>
    <p className={styles.muted}>قراءة صوتية عربية بنبرة أكاديمية رصينة، مع فواصل واضحة بين العناوين والمحاور، بواسطة الأصوات المتاحة على جهازك.</p>
    <div className={styles.audioControls}>
      <button type="button" className={styles.action} disabled={!supported || !voiceId || !entries.length} onClick={status === "playing" ? () => { window.speechSynthesis.pause(); setStatus("paused"); } : play}><PlatformIcon name={status === "playing" ? "pause" : "play"} />{status === "playing" ? "إيقاف مؤقت" : status === "paused" ? "استئناف" : "تشغيل المراجعة"}</button>
      <button type="button" className={styles.quiet} disabled={status === "stopped"} onClick={stop}>إيقاف</button>
      <label>السرعة<select value={rate} onChange={event => changeRate(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      <label>الصوت العربي<select aria-label="الصوت العربي" value={voiceId} disabled={!voices.length} onChange={event => { stop(); setVoiceId(event.target.value); }}>{voices.length ? voices.map(profile => <option key={profile.voice.voiceURI} value={profile.voice.voiceURI}>{profile.label} — {profile.region} — {profile.gender}</option>) : <option value="">لا يوجد صوت عربي متاح</option>}</select></label>
    </div>
    {supported === false || supported === true && !voices.length ? <p className={styles.notice} role="status">{supported === false ? "هذا المتصفح لا يدعم القراءة الصوتية. يمكنك قراءة الملخص أو تنزيل حزمة المراجعة." : "لا يتوفر صوت عربي حالياً. فعّل صوتًا عربيًا في إعدادات الجهاز، ثم أعد المحاولة."}</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <label className={styles.audioSeek}>موضع المراجعة <span>{position + 1} / {entries.length}</span><input aria-label="موضع المراجعة الصوتية" type="range" min="0" max={Math.max(0, entries.length - 1)} value={position} disabled={!entries.length} onChange={event => seek(Number(event.target.value))} /></label>
    <div className={styles.audioChapterList} aria-label="فصول المراجعة">{chapters.map(chapter => <button type="button" key={chapter.id} className={styles.quiet} aria-pressed={active?.chapterId === chapter.id} onClick={() => seek(entries.findIndex(entry => entry.chapterId === chapter.id))}>{chapter.title}</button>)}</div>
    {active ? <details className={styles.audioTranscript}><summary>النص في الموضع الحالي</summary><p>{active.text}</p></details> : null}
    <span className={styles.srOnly} role="status">{status === "playing" ? "المراجعة الصوتية قيد التشغيل" : status === "paused" ? "تم إيقاف القراءة مؤقتاً" : "المشغل متوقف"}</span>
  </section>;
}
