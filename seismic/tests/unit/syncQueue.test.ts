import { backoffMs, httpSender, PermanentSyncError, SyncQueue } from "../../src/offline/syncQueue";

let n = 0;
const uniqueDb = () => `seismic-test-${++n}`;

describe("SyncQueue (IndexedDB)", () => {
  it("persists, sends and clears items", async () => {
    const q = new SyncQueue({ dbName: uniqueDb() });
    await q.enqueue("production", { vps: 12 }, "a");
    await q.enqueue("qc", { note: "noisy trace" }, "b");
    expect(await q.size()).toBe(2);
    const sent: string[] = [];
    const r = await q.flush(async (item) => void sent.push(item.id));
    expect(r).toEqual({ sent: 2, failed: 0, dropped: 0, remaining: 0 });
    expect(sent.sort()).toEqual(["a", "b"]);
  });

  it("deduplicates by idempotency key", async () => {
    const q = new SyncQueue({ dbName: uniqueDb() });
    await q.enqueue("hse", { v: 1 }, "same");
    await q.enqueue("hse", { v: 2 }, "same");
    const items = await q.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.payload).toEqual({ v: 2 });
  });

  it("backs off transient failures and retries only when due", async () => {
    let now = 1_000;
    const q = new SyncQueue({ dbName: uniqueDb(), now: () => now, baseBackoffMs: 100 });
    await q.enqueue("production", {}, "x");
    const r1 = await q.flush(async () => { throw new Error("offline"); });
    expect(r1).toMatchObject({ failed: 1, remaining: 1 });
    const [item] = await q.list();
    expect(item).toMatchObject({ attempts: 1, lastError: "offline", nextAttemptAt: 1_100 });

    const send = vi.fn(async () => {});
    await q.flush(send); // not yet due
    expect(send).not.toHaveBeenCalled();
    now = 1_100;
    expect(await q.flush(send)).toMatchObject({ sent: 1, remaining: 0 });
  });

  it("drops permanent failures and items that exceed maxAttempts", async () => {
    const q = new SyncQueue({ dbName: uniqueDb(), maxAttempts: 1 });
    await q.enqueue("qc", {}, "p");
    await q.enqueue("qc", {}, "t");
    const r = await q.flush(async (i) => {
      throw i.id === "p" ? new PermanentSyncError("400") : new Error("500");
    });
    expect(r).toEqual({ sent: 0, failed: 0, dropped: 2, remaining: 0 });
  });

  it("shares a single run between concurrent flushes", async () => {
    const q = new SyncQueue({ dbName: uniqueDb() });
    await q.enqueue("production", {}, "only");
    const send = vi.fn(async () => {});
    const [a, b] = await Promise.all([q.flush(send), q.flush(send)]);
    expect(a).toBe(b);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("computes capped exponential backoff", () => {
    expect([1, 2, 3, 10].map((a) => backoffMs(a, 1000, 5000))).toEqual([1000, 2000, 4000, 5000]);
  });
});

describe("httpSender", () => {
  const item = { id: "k1", kind: "production" as const, payload: { a: 1 }, createdAt: 5, attempts: 0, nextAttemptAt: 0 };

  it("sends idempotency key and bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    await httpSender("/api/sync", async () => "tok", fetchImpl)(item);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ "Idempotency-Key": "k1", Authorization: "Bearer tok" });
  });

  it("classifies 4xx as permanent and 5xx/429 as transient", async () => {
    const mk = (status: number) => httpSender("/x", async () => null, async () => new Response(null, { status }));
    await expect(mk(422)(item)).rejects.toBeInstanceOf(PermanentSyncError);
    await expect(mk(503)(item)).rejects.not.toBeInstanceOf(PermanentSyncError);
    await expect(mk(429)(item)).rejects.not.toBeInstanceOf(PermanentSyncError);
  });
});
