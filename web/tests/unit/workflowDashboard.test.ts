import { describe, expect, it } from "vitest";
import type { ContentImport } from "@shared/index";
import { advanceSimulation, importWorkflow, isContentImportList, simulationWorkflow, workflowStats, type SimulationProgress } from "@/lib/workflowDashboard";

const job: ContentImport = {
  id: "job-1", title: "المحاضرة الأولى", filename: "محاضرة.pdf", uploadPartCount: 1,
  status: "processing", stage: "reading", subjectId: null, subjectTitle: null, fileId: null,
  lectures: [], questionCount: 0, generationMethod: null, errorMessage: null,
  createdAt: "2026-10-16T10:00:00Z", updatedAt: "2026-10-16T10:00:00Z",
};

describe("workflow dashboard provenance", () => {
  it.each([["reading", 0], ["classifying", 25], ["generating", 50], ["saving", 75]] as const)("counts only completed phases at %s", (stage, percent) => {
    const nodes = importWorkflow({ ...job, stage });
    expect(workflowStats(nodes)).toEqual({ clients: 1, masters: 1, specialists: 3, progress: percent });
    expect(nodes.filter(node => node.tier === "specialist" || node.tier === "integration").filter(node => node.progress === 100)).toHaveLength(percent / 25);
    expect(nodes.find(node => node.id === stage)?.state).toBe("running");
    expect(nodes.find(node => node.id === stage)?.progress).toBe(0);
  });

  it("marks all phases complete only after the persisted completed status", () => {
    expect(importWorkflow({ ...job, status: "completed", stage: "completed" }).every(node => node.progress === 100 && node.state === "completed")).toBe(true);
  });

  it("does not invent a completion percentage after failure or an unknown stage", () => {
    for (const input of [{ ...job, status: "failed" as const, stage: "failed" }, { ...job, stage: "new-worker-stage" }]) {
      const nodes = importWorkflow(input);
      expect(nodes[0]?.progress).toBe(100);
      expect(nodes.slice(1).every(node => node.progress === null)).toBe(true);
      expect(workflowStats(nodes).progress).toBeNull();
    }
  });

  it("does not imply that an incomplete upload has been accepted", () => {
    expect(importWorkflow({ ...job, status: "uploading", stage: "uploading" })[0]).toMatchObject({ progress: null, state: "running" });
    expect(importWorkflow({ ...job, status: "queued", stage: "queued" })[1]).toMatchObject({ progress: 0, state: "waiting" });
    expect(workflowStats([])).toEqual({ clients: 0, masters: 0, specialists: 0, progress: null });
  });

  it("keeps QA yellow and output purple, and advances dependencies in order without mutating prior state", () => {
    let progress: SimulationProgress = [0, 0, 0, 0];
    const original = progress;
    progress = advanceSimulation(progress);
    expect(original).toEqual([0, 0, 0, 0]);
    expect(progress).toEqual([25, 0, 0, 0]);
    for (let step = 0; step < 3; step++) progress = advanceSimulation(progress);
    expect(progress).toEqual([100, 0, 0, 0]);
    expect(workflowStats(simulationWorkflow(progress)).progress).toBe(25);
    expect(simulationWorkflow(progress).find(node => node.id === "qa")?.tier).toBe("specialist");
    expect(simulationWorkflow(progress).find(node => node.id === "output")?.tier).toBe("integration");
    for (let step = 0; step < 30; step++) progress = advanceSimulation(progress);
    expect(progress).toEqual([100, 100, 100, 100]);
    expect(workflowStats(simulationWorkflow(progress)).progress).toBe(100);
  });

  it("rejects malformed or unbounded API lists rather than showing fabricated defaults", () => {
    expect(isContentImportList([job])).toBe(true);
    expect(isContentImportList([])).toBe(true);
    for (const value of [null, {}, [null], [{ ...job, status: "toString" }], [{ ...job, updatedAt: "nonsense" }], Array(101).fill(job)]) {
      expect(isContentImportList(value)).toBe(false);
    }
  });
});
