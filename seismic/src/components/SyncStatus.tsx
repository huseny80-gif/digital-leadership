import { useEffect, useState } from "react";
import type { SyncQueue } from "../offline/syncQueue";
import { GlassCard } from "./GlassCard";
import { StatusBadge } from "./StatusBadge";

export interface SyncStatusProps {
  queue: SyncQueue;
  onReport: () => Promise<void>;
  onFlush: () => Promise<void>;
  online?: boolean;
}

export function SyncStatus({ queue, onReport, onFlush, online: forcedOnline }: SyncStatusProps) {
  const [pending, setPending] = useState(0);
  const [browserOnline, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const online = forcedOnline ?? browserOnline;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (forcedOnline !== undefined) return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [forcedOnline]);

  useEffect(() => {
    let alive = true;
    queue.size().then((n) => alive && setPending(n)).catch(() => {});
    return () => { alive = false; };
  }, [queue, busy]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setBusy(false); }
  };

  return (
    <GlassCard title="Field sync" className="span-4">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        {online ? <StatusBadge tone="ok">Online</StatusBadge> : <StatusBadge tone="warn">Offline — queuing</StatusBadge>}
        <span aria-live="polite"><strong>{pending}</strong> pending report{pending === 1 ? "" : "s"}</span>
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={() => run(onReport)}>Log production report</button>
        <button className="btn btn-primary" disabled={busy || !online || pending === 0} onClick={() => run(onFlush)}>Sync now</button>
      </div>
      {error && <p role="alert" className="alert" style={{ marginTop: 12 }}>{error}</p>}
    </GlassCard>
  );
}
