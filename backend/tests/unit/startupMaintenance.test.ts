import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { runStartupMaintenance } from "../../src/lib/startupMaintenance.js";

describe("content maintenance after readiness", () => {
  it("serves health requests while a slow refresh is unfinished, then starts the worker once", async () => {
    const server = createServer((_request, response) => { response.writeHead(200); response.end("ready"); });
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; }), worker = vi.fn(), failure = vi.fn();
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const maintenance = runStartupMaintenance({ refresh: () => gate, startWorker: worker, onFailure: failure });
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/health`);
      expect(response.status).toBe(200); expect(await response.text()).toBe("ready");
      expect(worker).not.toHaveBeenCalled(); finish(); await maintenance;
      expect(worker).toHaveBeenCalledOnce(); expect(failure).not.toHaveBeenCalled();
    } finally { finish(); await maintenance; await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("reports a failed refresh without stopping the listener or preventing import retries", async () => {
    const error = new Error("source unavailable"), worker = vi.fn(), failure = vi.fn();
    await expect(runStartupMaintenance({ refresh: async () => { throw error; }, startWorker: worker, onFailure: failure })).resolves.toBeUndefined();
    expect(failure).toHaveBeenCalledWith(error); expect(worker).toHaveBeenCalledOnce();
  });
  it("starts development workers immediately when no production refresh is requested", async () => {
    const worker = vi.fn(); await runStartupMaintenance({ startWorker: worker, onFailure: vi.fn() });
    expect(worker).toHaveBeenCalledOnce();
  });
});
