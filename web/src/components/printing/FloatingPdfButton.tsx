"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { StudyPrintDocument } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./printing.module.css";

export interface PrintSourceFile { label: string; href: string }
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function FloatingPdfButton({ document, getDocument, files = [], label = "طباعة PDF" }: {
  document?: StudyPrintDocument; getDocument?: () => StudyPrintDocument | null; files?: PrintSourceFile[]; label?: string;
}) {
  const mounted = useSyncExternalStore(subscribe, clientReady, serverReady);
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), wrapper = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null), busyRef = useRef(false);
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [open]);
  async function exportPdf() {
    if (busyRef.current) return;
    setError(null); setSaved(false);
    try {
      const input = document ?? getDocument?.();
      if (!input?.blocks.length) { setError("لا يوجد نص معروض للطباعة. يمكنك فتح ملف PDF الأصلي إن كان مرفقًا."); return; }
      busyRef.current = true; setBusy(true);
      const controller = new AbortController(); request.current = controller;
      const response = await fetch("/api/study-tools/print", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
      if (!response.ok) { const body = await response.json() as { error?: { message?: string } }; throw new Error(body.error?.message ?? "تعذر إعداد ملف PDF. حاول مرة أخرى."); }
      if (!response.headers.get("Content-Type")?.includes("application/pdf")) throw new Error("تعذر استلام ملف PDF. حاول مرة أخرى.");
      const blob = await response.blob(); if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = input.kind === "questions" ? "الأسئلة-القيادة-الرقمية.pdf" : "الملخص-القيادة-الرقمية.pdf";
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSaved(true); setOpen(false);
    } catch (reason) { if (!request.current?.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر إعداد ملف PDF. حاول مرة أخرى."); }
    finally { if (!request.current?.signal.aborted) { busyRef.current = false; setBusy(false); } }
  }
  // Glass cards establish a containing block for fixed descendants. A portal
  // keeps the action attached to the viewport and outside clipped card content.
  return mounted ? createPortal(<div className={styles.floating} ref={wrapper} dir="rtl">
    {open ? <div ref={panel} id={id} className={styles.panel} role="region" aria-label="خيارات طباعة PDF"><strong>طباعة الملخص</strong><button type="button" disabled={busy} onClick={() => void exportPdf()}>حفظ النص المعروض PDF</button>{error ? <p className={styles.error} role="alert">{error}</p> : null}{files.map(file => <a key={file.href} href={file.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><PlatformIcon name="document" />{file.label}<small>فتح الملف الأصلي للطباعة</small></a>)}</div> : null}
    {error && !open ? <p className={styles.error} role="alert">{error}</p> : null}
    <button ref={trigger} type="button" className={styles.button} title={label} aria-label={label} aria-expanded={files.length ? open : undefined} aria-controls={files.length ? id : undefined} disabled={busy} onClick={() => files.length ? setOpen(value => !value) : void exportPdf()}><PlatformIcon name="print" /><span>{busy ? "جارٍ إعداد PDF…" : "طباعة PDF"}</span></button>
    <span className={styles.srOnly} role="status">{saved ? "تم إعداد ملف PDF. يمكنك فتحه وحفظه أو طباعته." : ""}</span>
  </div>, window.document.body) : null;
}
