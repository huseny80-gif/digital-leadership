"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { LearningOverview } from "@shared/index";
import { learningResource } from "@/lib/learning";

interface LearningState {
  overview: LearningOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
const LearningContext = createContext<LearningState>({
  overview: null,
  loading: true,
  error: null,
  refresh: async () => {},
});
export const useLearning = () => useContext(LearningContext);

export function LearningProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [overview, setOverview] = useState<LearningOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const response = await fetch("/api/learning/overview", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = (await response.json()) as { data?: LearningOverview };
      if (!response.ok || !body.data) throw new Error("learning_unavailable");
      if (controller.signal.aborted) return;
      setOverview(body.data);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error)
        setError("تعذر تحميل تقدمك ومهامك. أعد المحاولة.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(onFocus, 60000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("learning-progress-updated", onFocus);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("learning-progress-updated", onFocus);
      inFlight.current?.abort();
    };
  }, [refresh, pathname]);

  useEffect(() => {
    const resource = learningResource(pathname ?? "");
    if (!resource) return;
    let lastInteraction = Date.now();
    let busy = false;
    let stopped = false;
    const interact = () => {
      lastInteraction = Date.now();
    };
    const heartbeat = async (pause = false) => {
      if (busy && !pause) return;
      const active =
        !pause &&
        document.visibilityState === "visible" &&
        Date.now() - lastInteraction < 300000;
      busy = true;
      try {
        await fetch("/api/learning/heartbeat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...resource, active }),
          keepalive: pause,
          cache: "no-store",
        });
      } catch {
        /* Offline intervals are deliberately not backfilled. */
      } finally {
        busy = false;
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => {
      if (!stopped) void heartbeat();
    }, 15000);
    const visibility = () => {
      if (document.visibilityState === "visible") interact();
      void heartbeat(document.visibilityState !== "visible");
    };
    const hide = () => {
      void heartbeat(true);
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((event) =>
      window.addEventListener(event, interact, { passive: true }),
    );
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    return () => {
      stopped = true;
      clearInterval(timer);
      void heartbeat(true);
      events.forEach((event) => window.removeEventListener(event, interact));
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
    };
  }, [pathname]);

  return (
    <LearningContext.Provider value={{ overview, loading, error, refresh }}>
      {children}
    </LearningContext.Provider>
  );
}
