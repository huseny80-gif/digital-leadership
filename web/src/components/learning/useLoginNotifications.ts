"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoginNotificationsFeed } from "@shared/index";

type View = { data: LoginNotificationsFeed | null; loading: boolean; error: string | null };
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function validFeed(value: unknown): value is LoginNotificationsFeed {
  if (!value || typeof value !== "object") return false;
  const data = value as LoginNotificationsFeed;
  if (!Array.isArray(data.items) || data.items.length > 20 || !Number.isSafeInteger(data.unreadCount) || data.unreadCount < 0) return false;
  const ids = new Set<string>();
  for (const item of data.items) {
    if (!item || typeof item.id !== "string" || !uuid.test(item.id) || ids.has(item.id)
      || !["trainee", "visitor"].includes(item.kind) || typeof item.displayName !== "string" || !item.displayName.trim()
      || typeof item.read !== "boolean" || typeof item.enteredAt !== "string" || !Number.isFinite(Date.parse(item.enteredAt))) return false;
    ids.add(item.id);
  }
  return data.latestId === (data.items[0]?.id ?? null);
}

/** The role controls rendering only; the server independently authorizes every request. */
export function useLoginNotifications(enabled: boolean, open: boolean) {
  const [view, setView] = useState<View>({ data: null, loading: true, error: null });
  const [marking, setMarking] = useState(false);
  const request = useRef<AbortController | null>(null);
  const acknowledgement = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch("/api/admin/login-notifications", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !validFeed(body.data)) throw new Error(response.status === 401 || response.status === 403 ? "session" : "unavailable");
      if (!controller.signal.aborted) setView({ data: body.data, loading: false, error: null });
    } catch (error) {
      if (controller.signal.aborted) return;
      const session = error instanceof Error && error.message === "session";
      setView(previous => ({ data: session ? null : previous.data, loading: false,
        error: session ? "انتهت صلاحية الدخول إلى التنبيهات. ادخل إلى المنصة مجددًا." : "تعذر تحميل إشعارات الدخول. أعد المحاولة." }));
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const initial = window.setTimeout(visible, 0);
    const interval = window.setInterval(visible, 30_000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(initial); clearInterval(interval);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      request.current?.abort();
    };
  }, [enabled, open, refresh]);
  // Closing the popover only changes its visibility; finish an explicit read
  // action so it cannot leave the button stuck when the menu reopens.
  useEffect(() => () => acknowledgement.current?.abort(), [enabled]);

  const markAllRead = useCallback(async () => {
    const throughId = view.data?.latestId;
    if (!enabled || !throughId || acknowledgement.current) return;
    const controller = new AbortController(); acknowledgement.current = controller; setMarking(true);
    try {
      const response = await fetch("/api/admin/login-notifications/read", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ throughId }), signal: controller.signal });
      if (!response.ok) throw new Error("acknowledgement_failed");
      if (!controller.signal.aborted) await refresh();
    } catch {
      if (!controller.signal.aborted) setView(previous => ({ ...previous, error: "تعذر حفظ حالة القراءة. أعد المحاولة." }));
    } finally {
      acknowledgement.current = null;
      setMarking(false);
    }
  }, [enabled, view.data?.latestId, refresh]);

  return { ...(enabled ? view : { data: null, loading: false, error: null }), marking, refresh, markAllRead };
}
