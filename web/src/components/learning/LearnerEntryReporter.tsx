"use client";

import { useEffect } from "react";

/** Only report successful access to the application. Identity comes from the
 * server's verified session, and durable deduplication lives in the database. */
export function LearnerEntryReporter({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, recorded = false, busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const send = async () => {
      if (stopped || recorded || busy || document.visibilityState !== "visible") return;
      clearTimeout(timer); busy = true; controller = new AbortController();
      try {
        const response = await fetch("/api/learning/entry", { method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "content-type": "application/json" }, body: "{}", signal: controller.signal });
        recorded = response.ok || response.status === 401 || response.status === 403;
      } catch { /* A transient failure must not block study access. */ }
      finally {
        busy = false;
        if (!stopped && !recorded) timer = setTimeout(() => void send(), 30_000);
      }
    };
    const visible = () => { void send(); };
    void send();
    window.addEventListener("online", visible); window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true; clearTimeout(timer); controller?.abort();
      window.removeEventListener("online", visible); window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled]);
  return null;
}
