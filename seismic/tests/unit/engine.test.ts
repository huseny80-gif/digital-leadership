import { DEFAULT_CREW_CONFIG } from "../../src/domain/equipment";
import { buildReceiverStations, buildSourcePoints, DEMO_GEOMETRY } from "../../src/domain/survey";
import { buildExecutionPlan } from "../../src/planner/executionPlan";
import { createSimState, DEFAULT_SIM_OPTIONS, step, summarize, type SimOptions, type SimState } from "../../src/simulation/engine";
import { createRng } from "../../src/simulation/rng";

const plan = buildExecutionPlan(buildSourcePoints(DEMO_GEOMETRY), DEFAULT_CREW_CONFIG);
const receivers = buildReceiverStations(DEMO_GEOMETRY);

function runToEnd(opts: SimOptions, seed = 1, dt = 5, maxSteps = 50_000): SimState {
  const rng = createRng(seed);
  let s = createSimState(plan, receivers);
  for (let i = 0; i < maxSteps && !s.finished; i++) s = step(s, dt, plan, rng, opts);
  return s;
}

const noFaults: SimOptions = { ...DEFAULT_SIM_OPTIONS, crew: { ...DEFAULT_CREW_CONFIG, dgpsDropoutRate: 0, nodeFaultRate: 0 } };

describe("multi-agent simulation", () => {
  it("is deterministic for a given seed", () => {
    const a = runToEnd(DEFAULT_SIM_OPTIONS, 42);
    const b = runToEnd(DEFAULT_SIM_OPTIONS, 42);
    expect(a.t).toBe(b.t);
    expect(a.events).toEqual(b.events);
  });

  it("does not mutate the previous state", () => {
    const s0 = createSimState(plan, receivers);
    const snapshot = structuredClone(s0);
    step(s0, 10, plan, createRng(1), noFaults);
    expect(s0).toEqual(snapshot);
  });

  it("acquires every VP and records sweepsPerVp shots each", () => {
    const end = runToEnd(noFaults);
    expect(end.finished).toBe(true);
    const sum = summarize(end, plan);
    expect(sum.completedVps).toBe(plan.totalPoints);
    expect(sum.progress).toBe(1);
    expect(end.recorder.shotRecords).toBe(plan.totalPoints * DEFAULT_CREW_CONFIG.vibrator.sweepsPerVp);
    expect(end.events.at(-1)?.message).toMatch(/Acquisition complete/);
  });

  it("finishes close to the planner's makespan when nothing fails", () => {
    const end = runToEnd(noFaults, 1, 1);
    // Recorder arbitration between fleets adds a small queueing delay.
    expect(end.t).toBeGreaterThanOrEqual(plan.makespanS * 0.95);
    expect(end.t).toBeLessThan(plan.makespanS * 1.5);
  });

  it("holds a fleet at the VP while DGPS has no RTK fix", () => {
    const opts: SimOptions = { ...noFaults, crew: { ...noFaults.crew, dgpsDropoutRate: 1 }, dgpsRecoverSeconds: 1e9 };
    let s = createSimState(plan, receivers);
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) s = step(s, 5, plan, rng, opts);
    expect(s.fleets.every((f) => f.completedVps === 0)).toBe(true);
    expect(s.fleets.some((f) => f.phase === "waitingFix")).toBe(true);
    expect(s.events.some((e) => e.source === "DGPS" && /lost RTK/.test(e.message))).toBe(true);
  });

  it("recorder holds shots when the spread fails QC, then repairs restore it", () => {
    const opts: SimOptions = { ...noFaults, maxFaultFraction: 0, nodeRepairSeconds: 10 };
    let s = createSimState(plan, receivers);
    s = { ...s, nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, ok: false } : n)) };
    const rng = createRng(9);
    s = step(s, 1, plan, rng, opts);
    expect(s.recorder.ready).toBe(false);
    expect(s.events.some((e) => e.level === "error" && /Spread QC failed/.test(e.message))).toBe(true);
    for (let i = 0; i < 20; i++) s = step(s, 1, plan, rng, opts);
    expect(s.recorder.ready).toBe(true);
    expect(s.nodes.every((n) => n.ok)).toBe(true);
  });

  it("caps the event log and rejects invalid dt", () => {
    const end = runToEnd({ ...DEFAULT_SIM_OPTIONS, maxEvents: 25 }, 5);
    expect(end.events.length).toBeLessThanOrEqual(25);
    expect(() => step(createSimState(plan, receivers), 0, plan, createRng(1))).toThrow(RangeError);
  });

  it("returns the same object once finished", () => {
    const end = runToEnd(noFaults);
    expect(step(end, 5, plan, createRng(1), noFaults)).toBe(end);
  });
});
