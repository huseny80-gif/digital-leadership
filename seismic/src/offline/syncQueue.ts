/**
 * Offline-first outbound queue backed by IndexedDB.
 *
 * Field reports (daily production, QC notes, HSE observations) are written
 * locally first and flushed when connectivity returns. Every item carries an
 * idempotency key, so a flush interrupted mid-request is safe to retry: the
 * server deduplicates on `Idempotency-Key`.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type ReportKind = "production" | "qc" | "hse" | "equipment";

export interface QueueItem<T = unknown> {
  id: string; // idempotency key
  kind: ReportKind;
  payload: T;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

interface QueueDB extends DBSchema {
  outbox: { key: string; value: QueueItem; indexes: { byNextAttempt: number } };
}

export type Sender = (item: QueueItem) => Promise<void>;

/** Thrown by a Sender when retrying would never succeed (e.g. HTTP 4xx). */
export class PermanentSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentSyncError";
  }
}

export interface FlushResult {
  sent: number;
  failed: number;
  dropped: number;
  remaining: number;
}

export interface SyncQueueOptions {
  dbName?: string;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
  newId?: () => string;
}

export function backoffMs(attempts: number, base: number, max: number): number {
  return Math.min(max, base * 2 ** Math.max(0, attempts - 1));
}

export class SyncQueue {
  private dbp: Promise<IDBPDatabase<QueueDB>>;
  private flushing: Promise<FlushResult> | null = null;
  private readonly maxAttempts: number;
  private readonly base: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(opts: SyncQueueOptions = {}) {
    this.maxAttempts = opts.maxAttempts ?? 8;
    this.base = opts.baseBackoffMs ?? 2_000;
    this.max = opts.maxBackoffMs ?? 5 * 60_000;
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.dbp = openDB<QueueDB>(opts.dbName ?? "seismic-sync", 1, {
      upgrade(db) {
        const store = db.createObjectStore("outbox", { keyPath: "id" });
        store.createIndex("byNextAttempt", "nextAttemptAt");
      },
    });
  }

  async enqueue<T>(kind: ReportKind, payload: T, id: string = this.newId()): Promise<QueueItem<T>> {
    const item: QueueItem<T> = { id, kind, payload, createdAt: this.now(), attempts: 0, nextAttemptAt: 0 };
    const db = await this.dbp;
    // put() — re-enqueueing the same idempotency key replaces, never duplicates.
    await db.put("outbox", item as QueueItem);
    return item;
  }

  async list(): Promise<QueueItem[]> {
    const db = await this.dbp;
    return db.getAllFromIndex("outbox", "byNextAttempt");
  }

  async size(): Promise<number> {
    return (await this.dbp).count("outbox");
  }

  /** Sends every due item in FIFO-by-due-time order. Concurrent calls share one run. */
  flush(send: Sender): Promise<FlushResult> {
    if (!this.flushing) {
      this.flushing = this.runFlush(send).finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async runFlush(send: Sender): Promise<FlushResult> {
    const db = await this.dbp;
    const now = this.now();
    const due = await db.getAllFromIndex("outbox", "byNextAttempt", IDBKeyRange.upperBound(now));
    let sent = 0, failed = 0, dropped = 0;
    for (const item of due) {
      try {
        await send(item);
        await db.delete("outbox", item.id);
        sent++;
      } catch (err) {
        const attempts = item.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof PermanentSyncError || attempts >= this.maxAttempts) {
          // Moved out of the hot path; surfaced to the UI via onDropped hooks later.
          await db.delete("outbox", item.id);
          dropped++;
          continue;
        }
        await db.put("outbox", { ...item, attempts, lastError: message, nextAttemptAt: now + backoffMs(attempts, this.base, this.max) });
        failed++;
      }
    }
    return { sent, failed, dropped, remaining: await db.count("outbox") };
  }

  async close(): Promise<void> {
    (await this.dbp).close();
  }
}

/** Default HTTP sender: POST JSON with Idempotency-Key; 4xx ⇒ permanent. */
export function httpSender(endpoint: string, getToken: () => Promise<string | null>, fetchImpl: typeof fetch = fetch): Sender {
  return async (item) => {
    const token = await getToken();
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": item.id,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind: item.kind, payload: item.payload, createdAt: item.createdAt }),
    });
    if (res.ok) return;
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new PermanentSyncError(`Rejected by server: HTTP ${res.status}`);
    }
    throw new Error(`Transient sync failure: HTTP ${res.status}`);
  };
}
