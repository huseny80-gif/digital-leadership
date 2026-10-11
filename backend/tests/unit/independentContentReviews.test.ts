import { describe, expect, it, vi } from "vitest";
import { runIndependentContentReviews, runStartupMaintenance } from "../../src/lib/startupMaintenance.js";

describe("independent source reviews during live exam archive updates", () => {
  it("upgrades archives despite a failed OneDrive review and starts imports afterwards", async () => {
    const order: string[] = [], failure = vi.fn(), error = new Error("reviewed_lecture_missing");
    await runStartupMaintenance({ refresh: () => runIndependentContentReviews([
      { name: "onedrive_sources", run: async () => { order.push("onedrive"); throw error; } },
      { name: "risk_content", run: async () => { order.push("risk"); } },
      { name: "exam_archives", run: async () => { order.push("exams"); } },
    ], failure), onFailure: vi.fn(), startWorker: () => { order.push("worker"); } });
    expect(order).toEqual(["onedrive", "risk", "exams", "worker"]);
    expect(failure).toHaveBeenCalledExactlyOnceWith("onedrive_sources", error);
  });
  it("keeps transaction order and does not race archive updates with queued imports", async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; }), exam = vi.fn(), worker = vi.fn();
    const job = runStartupMaintenance({ refresh: () => runIndependentContentReviews([
      { name: "risk_content", run: () => gate }, { name: "exam_archives", run: exam },
    ], vi.fn()), onFailure: vi.fn(), startWorker: worker });
    expect(exam).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled();
    finish(); await job;
    expect(exam).toHaveBeenCalledOnce(); expect(worker).toHaveBeenCalledOnce();
  });
  it("reports failures separately while still running the repeat-safe archive refresh", async () => {
    const failure = vi.fn(), archive = vi.fn().mockResolvedValue({ alreadyCurrent: 1 });
    await runIndependentContentReviews([
      { name: "onedrive_sources", run: async () => { throw new Error("source_identity_mismatch"); } },
      { name: "risk_content", run: async () => { throw new Error("reviewed_source_missing"); } },
      { name: "exam_archives", run: archive },
    ], failure);
    expect(failure.mock.calls.map(call => call[0])).toEqual(["onedrive_sources", "risk_content"]);
    expect(archive).toHaveBeenCalledOnce();
  });
});
