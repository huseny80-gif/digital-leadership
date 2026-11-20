"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { StudyAssistantMode, StudyAssistantRequest, StudyAssistantResponse, StudyCatalog } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { StudyReviewQuiz } from "./StudyReviewQuiz";
import { studyRequest } from "./request";
import { StudyAssistantWelcome, STUDY_ASSISTANT_GREETING } from "./StudyAssistantWelcome";
import styles from "./studyTools.module.css";

interface Message { id: string; role: "user" | "assistant"; text: string; response?: StudyAssistantResponse }
const modes: Array<{ id: StudyAssistantMode; label: string }> = [{ id: "answer", label: "اسأل عن مفهوم" }, { id: "summary", label: "لخّص" }, { id: "quiz", label: "أسئلة مراجعة" }];
const POSITION_KEY = "dl-study-assistant-position";
const DRAG_THRESHOLD = 5;
interface Position { left: number; top: number }
/** Keeps the floating assistant fully inside the viewport. */
function clampPosition(position: Position, width: number, height: number): Position {
  const maxLeft = Math.max(0, window.innerWidth - width), maxTop = Math.max(0, window.innerHeight - height);
  return { left: Math.min(Math.max(0, position.left), maxLeft), top: Math.min(Math.max(0, position.top), maxTop) };
}
export function StudyAssistantWidget({ welcomeOnEntry = false }: { welcomeOnEntry?: boolean }) {
  const pathname = usePathname();
  const contextSubject = pathname.match(/^\/subjects\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [welcoming, setWelcoming] = useState(welcomeOnEntry);
  const [catalog, setCatalog] = useState<StudyCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [subject, setSubject] = useState<string | null>(null);
  const [mode, setMode] = useState<StudyAssistantMode>("answer");
  const [pasted, setPasted] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const active = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const lastRequest = useRef<StudyAssistantRequest | null>(null);
  const subjectId = subject ?? contextSubject ?? "";

  useEffect(() => {
    if (!open || catalog) return;
    const controller = new AbortController();
    void studyRequest<StudyCatalog>("catalog", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setCatalog(result); setCatalogError(null); } }).catch(reason => { if (!controller.signal.aborted) setCatalogError(reason instanceof Error ? reason.message : "تعذر تحميل المواد."); });
    return () => controller.abort();
  }, [open, catalog, catalogRetry]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  useEffect(() => { if (open) end.current?.scrollIntoView?.({ block: "end", behavior: "instant" }); }, [messages, busy, open]);
  useEffect(() => () => active.current?.abort(), []);
  // The assistant may be dragged anywhere on screen; the last spot is a per-viewer convenience.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? "null") as Position | null;
      const box = container.current?.getBoundingClientRect();
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top) && box) setPosition(clampPosition(saved, box.width, box.height));
    } catch { /* storage unavailable: keep the default corner */ }
  }, []);
  useEffect(() => {
    if (!position) return;
    const keepInside = () => { const box = container.current?.getBoundingClientRect(); if (box) setPosition(current => current ? clampPosition(current, box.width, box.height) : current); };
    window.addEventListener("resize", keepInside);
    return () => window.removeEventListener("resize", keepInside);
  }, [position !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  function remember(next: Position) { try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const box = container.current?.getBoundingClientRect(); if (!box) return;
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, left: box.left, top: box.top, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture is optional */ }
  }
  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = drag.current, box = container.current?.getBoundingClientRect();
    if (!state || state.pointer !== event.pointerId || !box) return;
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.moved = true; setDragging(true);
    setPosition(clampPosition({ left: state.left + dx, top: state.top + dy }, box.width, box.height));
  }
  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = drag.current; if (!state || state.pointer !== event.pointerId) return;
    drag.current = null; setDragging(false);
    if (state.moved) {
      suppressClick.current = true; requestAnimationFrame(() => { suppressClick.current = false; });
      const box = container.current?.getBoundingClientRect(); if (box) remember({ left: box.left, top: box.top });
    }
  }
  function nudge(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!event.altKey) return;
    const step = 24, delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : null;
    const box = container.current?.getBoundingClientRect(); if (!delta || !box) return;
    event.preventDefault();
    const next = clampPosition({ left: box.left + delta[0]!, top: box.top + delta[1]! }, box.width, box.height); setPosition(next); remember(next);
  }
  const nearTop = position ? position.top + 28 < window.innerHeight / 2 : false;
  const nearRight = position ? position.left + 60 > window.innerWidth / 2 : false;

  async function send(payload: StudyAssistantRequest) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); lastRequest.current = payload;
    const controller = new AbortController(); active.current = controller;
    try {
      const response = await studyRequest<StudyAssistantResponse>("chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      if (!controller.signal.aborted) setMessages(previous => [...previous.slice(-39), { id: crypto.randomUUID(), role: "assistant", text: response.text, response }]);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر إرسال السؤال."); }
    finally { if (!controller.signal.aborted) { busyRef.current = false; setBusy(false); } }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); const text = draft.trim();
    if (busyRef.current || text.length < 2 || pasted && text.length < 70) return;
    const payload: StudyAssistantRequest = { message: pasted ? "لخص النص الدراسي الذي أرسلته." : text, mode, ...(subjectId ? { subjectId } : {}), ...(pasted ? { text } : {}), history: messages.slice(-8).map(message => ({ role: message.role, text: message.text.slice(0, 1200) })) };
    setMessages(previous => [...previous.slice(-39), { id: crypto.randomUUID(), role: "user", text }]); setDraft(""); void send(payload);
  }
  function clear() { active.current?.abort(); busyRef.current = false; setBusy(false); setMessages([]); setError(null); lastRequest.current = null; input.current?.focus(); }

  return <div ref={container} className={styles.assistant} dir="rtl" data-moved={position ? "true" : undefined} data-vertical={nearTop ? "below" : "above"} data-horizontal={nearRight ? "right" : "left"} style={position ? { left: position.left, top: position.top, insetInlineEnd: "auto", bottom: "auto" } : undefined}>
    {welcoming ? <StudyAssistantWelcome onChoose={destination => {
      setWelcoming(false);
      if (destination === "assistant") setOpen(true);
      else requestAnimationFrame(() => (document.getElementById("main-content") ?? trigger.current)?.focus());
    }} /> : null}
    {open ? <section id={id} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} className={styles.drawer}>
      <header className={styles.drawerHeader}><span className={styles.assistantSymbol}><PlatformIcon name="assistant" /></span><div><h2 id={`${id}-title`}>مساعدك الدراسي</h2><p>إجابات ومراجعات مستندة إلى المحتوى</p></div><button type="button" className={styles.iconButton} aria-label="إغلاق المساعد الدراسي" onClick={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }}><PlatformIcon name="close" /></button></header>
      <div className={styles.chatContext}><label htmlFor={`${id}-subject`}>المادة الدراسية</label><select id={`${id}-subject`} value={subjectId} disabled={busy} onChange={event => setSubject(event.target.value)}><option value="">جميع المواد المنشورة</option>{catalog?.subjects.map(course => <option value={course.id} key={course.id}>{course.title}</option>)}</select>
        {catalogError ? <p role="alert">{catalogError} <button type="button" onClick={() => setCatalogRetry(value => value + 1)}>إعادة المحاولة</button></p> : null}
        <div className={styles.modeButtons} aria-label="نوع المساعدة">{modes.map(item => <button type="button" key={item.id} aria-pressed={mode === item.id} disabled={busy} onClick={() => { setMode(item.id); if (item.id !== "summary") setPasted(false); }}>{item.label}</button>)}</div>
      </div>
      <div className={styles.messages} role="log" aria-live="polite" aria-label="محادثة المساعد الدراسي">
        {!messages.length ? <div className={styles.chatWelcome}><PlatformIcon name="assistant" /><h3>{STUDY_ASSISTANT_GREETING}</h3><p>اكتب سؤالًا عن محاضرة، أو اطلب تلخيصًا، أو جرّب أسئلة مراجعة. تظهر المصادر مع الإجابة.</p></div> : null}
        {messages.map(message => <article key={message.id} className={styles.message} data-role={message.role}><strong>{message.role === "user" ? "أنت" : "المساعد الدراسي"}</strong><p>{message.text}</p>
          {message.response?.quiz.length ? <StudyReviewQuiz questions={message.response.quiz} /> : null}
          {message.response?.citations.length ? <details className={styles.citations}><summary>المصادر ({message.response.citations.length})</summary>{message.response.citations.map((citation, index) => <div key={`${citation.sourceId}-${index}`}>{citation.href ? <Link href={citation.href} onClick={() => setOpen(false)}>{citation.title}</Link> : <strong>{citation.title}</strong>}<blockquote>{citation.excerpt}</blockquote></div>)}</details> : null}
        </article>)}
        {busy ? <p className={styles.chatStatus} role="status">جارٍ إعداد الإجابة…</p> : null}
        {error ? <div className={styles.error} role="alert">{error}<button type="button" className={styles.quiet} onClick={() => { if (lastRequest.current) void send(lastRequest.current); }}>إعادة الإرسال</button></div> : null}
        <div ref={end} />
      </div>
      <form className={styles.composer} onSubmit={submit}>
        {mode === "summary" ? <label className={styles.pasteToggle}><input type="checkbox" checked={pasted} disabled={busy} onChange={event => setPasted(event.target.checked)} />تلخيص نص ألصقه هنا</label> : null}
        <label className={styles.srOnly} htmlFor={`${id}-input`}>{pasted ? "النص المطلوب تلخيصه" : "سؤالك الدراسي"}</label><textarea ref={input} id={`${id}-input`} value={draft} maxLength={pasted ? 12000 : 2000} rows={3} disabled={busy} placeholder={pasted ? "الصق النص الدراسي هنا…" : "اكتب سؤالك أو طلب المراجعة…"} onChange={event => setDraft(event.target.value)} />
        <div className={styles.composerActions}><button type="submit" className={styles.action} disabled={busy || draft.trim().length < (pasted ? 70 : 2)}>إرسال <PlatformIcon name="arrow" /></button><button type="button" className={styles.quiet} onClick={clear} disabled={!messages.length && !busy}>مسح المحادثة</button><small>{draft.length}/{pasted ? 12000 : 2000}</small></div>
      </form>
    </section> : null}
    {!welcoming ? <button ref={trigger} type="button" className={styles.floatingButton} data-dragging={dragging ? "true" : undefined} aria-label={open ? "إغلاق المساعد الدراسي" : "فتح المساعد الدراسي"} aria-expanded={open} aria-controls={id} title="اسحبه لتحريكه في أي مكان من الشاشة" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={nudge} onClick={() => { if (suppressClick.current) return; setOpen(value => !value); }}><PlatformIcon name={open ? "close" : "assistant"} /><span>مساعدك الدراسي</span></button> : null}
  </div>;
}
