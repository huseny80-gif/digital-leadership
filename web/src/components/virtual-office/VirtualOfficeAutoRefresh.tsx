"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function VirtualOfficeAutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    lastRefresh.current = Date.now();
    const refreshId = setInterval(() => {
      router.refresh();
      lastRefresh.current = Date.now();
      setElapsed(0);
      setFlashing(true);
      setTimeout(() => setFlashing(false), 800);
    }, intervalMs);
    return () => clearInterval(refreshId);
  }, [router, intervalMs]);

  useEffect(() => {
    const tickId = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastRefresh.current) / 1000));
    }, 1_000);
    return () => clearInterval(tickId);
  }, []);

  return (
    <div className={`vo-refresh-indicator${flashing ? " vo-refresh-indicator--flash" : ""}`} aria-live="polite">
      <span className="vo-refresh-dot" />
      <span>يتجدد تلقائياً · منذ {elapsed} ث</span>
    </div>
  );
}
