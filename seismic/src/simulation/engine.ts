/**
 * Multi-agent acquisition simulation.
 *
 * Agents, each a pure reducer over shared state:
 *  - VibratorFleetAgent: moves → sweeps → listens through its planned VPs.
 *  - DgpsAgent:          RTK fix per fleet; a fleet may not sweep without fix.
 *  - RecorderAgent:      Sercel 508XT — accepts shots only while "ready",
 *                        counts shot records, logs QC events.
 *  - NodeCrewAgent:      wireless-node faults appear randomly; a line crew
 *                        repairs them one at a time.
 *
 * `step(state, dt, rng)` never mutates its input; same seed ⇒ same run.
 */
import { DEFAULT_CREW_CONFIG, vpOccupancySeconds, type CrewConfig, type Position } from "../domain/equipment";
import type { ReceiverStation } from "../domain/survey";
import type { ExecutionPlan } from "../planner/executionPlan";
import type { Rng } from "./rng";

export type FleetPhase = "moving" | "waitingFix" | "waitingRecorder" | "sweeping" | "listening" | "done";

export interface FleetState {
  id: string;
  phase: FleetPhase;
  taskIndex: number;
  position: Position;
  phaseRemainingS: number;
  sweepIndex: number;
  hasFix: boolean;
  fixRecoverS: number;
  completedVps: number;
}

export interface NodeState {
  id: string;
  position: Position;
  ok: boolean;
}

export interface RecorderState {
  ready: boolean;
  busyRemainingS: number;
  shotRecords: number;
}

export type SimEventLevel = "info" | "warn" | "error";
export interface SimEvent {
  t: number;
  level: SimEventLevel;
  source: string;
  message: string;
}

export interface SimState {
  t: number;
  fleets: FleetState[];
  nodes: NodeState[];
  recorder: RecorderState;
  repair: { nodeId: string; remainingS: number } | null;
  events: SimEvent[];
  finished: boolean;
}

export interface SimOptions {
  crew: CrewConfig;
  /** Recorder write/QC time per record, seconds. */
  recordSeconds: number;
  nodeRepairSeconds: number;
  dgpsRecoverSeconds: number;
  /** Recorder refuses shots if more than this fraction of nodes is faulted. */
  maxFaultFraction: number;
  maxEvents: number;
}

export const DEFAULT_SIM_OPTIONS: SimOptions = {
  crew: DEFAULT_CREW_CONFIG,
  recordSeconds: 2,
  nodeRepairSeconds: 90,
  dgpsRecoverSeconds: 20,
  maxFaultFraction: 0.1,
  maxEvents: 200,
};

export function createSimState(plan: ExecutionPlan, receivers: ReceiverStation[], start: Position = { x: 0, y: 0 }): SimState {
  return {
    t: 0,
    fleets: plan.fleets.map((f) => ({
      id: f.fleetId,
      phase: f.tasks.length ? "moving" : "done",
      taskIndex: 0,
      position: { ...start },
      phaseRemainingS: 0,
      sweepIndex: 0,
      hasFix: true,
      fixRecoverS: 0,
      completedVps: 0,
    })),
    nodes: receivers.map((r) => ({ id: r.id, position: r.position, ok: true })),
    recorder: { ready: true, busyRemainingS: 0, shotRecords: 0 },
    repair: null,
    events: [{ t: 0, level: "info", source: "Recorder", message: "Sercel 508XT online — spread ready" }],
    finished: plan.fleets.every((f) => f.tasks.length === 0),
  };
}

function pushEvent(events: SimEvent[], e: SimEvent, max: number): SimEvent[] {
  const next = [...events, e];
  return next.length > max ? next.slice(next.length - max) : next;
}

function moveToward(from: Position, to: Position, maxStep: number): { pos: Position; arrived: boolean } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep || d === 0) return { pos: { ...to }, arrived: true };
  return { pos: { x: from.x + (dx / d) * maxStep, y: from.y + (dy / d) * maxStep }, arrived: false };
}

export function step(prev: SimState, dt: number, plan: ExecutionPlan, rng: Rng, opts: SimOptions = DEFAULT_SIM_OPTIONS): SimState {
  if (!(dt > 0)) throw new RangeError("dt must be > 0");
  if (prev.finished) return prev;

  const t = prev.t + dt;
  const { crew } = opts;
  let events = prev.events;
  const log = (level: SimEventLevel, source: string, message: string) => {
    events = pushEvent(events, { t, level, source, message }, opts.maxEvents);
  };

  // ---- NodeCrewAgent: random faults + sequential repair -------------------
  let nodes = prev.nodes.map((n) => {
    if (n.ok && rng() < crew.nodeFaultRate) {
      log("warn", "Nodes", `${n.id} reported fault (low battery / no GNSS time)`);
      return { ...n, ok: false };
    }
    return n;
  });
  let repair = prev.repair ? { ...prev.repair, remainingS: prev.repair.remainingS - dt } : null;
  if (repair && repair.remainingS <= 0) {
    const id = repair.nodeId;
    nodes = nodes.map((n) => (n.id === id ? { ...n, ok: true } : n));
    log("info", "Line crew", `${id} repaired and back in spread`);
    repair = null;
  }
  if (!repair) {
    const faulted = nodes.find((n) => !n.ok);
    if (faulted) repair = { nodeId: faulted.id, remainingS: opts.nodeRepairSeconds };
  }

  // ---- RecorderAgent readiness --------------------------------------------
  const faultFraction = nodes.length ? nodes.filter((n) => !n.ok).length / nodes.length : 0;
  let recorder = { ...prev.recorder, busyRemainingS: Math.max(0, prev.recorder.busyRemainingS - dt) };
  const spreadOk = faultFraction <= opts.maxFaultFraction;
  if (spreadOk !== prev.recorder.ready) {
    log(spreadOk ? "info" : "error", "Recorder", spreadOk ? "Spread within QC limits — recording resumed" : `Spread QC failed (${Math.round(faultFraction * 100)}% nodes down) — holding shots`);
  }
  recorder.ready = spreadOk;

  // ---- DGPS + VibratorFleetAgents -----------------------------------------
  const occupancyPerSweep = crew.vibrator.sweepSeconds;
  vpOccupancySeconds(crew.vibrator); // validates params

  const fleets = prev.fleets.map((f0, i) => {
    const f: FleetState = { ...f0 };
    const tasks = plan.fleets[i]?.tasks ?? [];
    if (f.phase === "done") return f;

    // DGPS agent
    if (f.hasFix && rng() < crew.dgpsDropoutRate) {
      f.hasFix = false;
      f.fixRecoverS = opts.dgpsRecoverSeconds;
      log("warn", "DGPS", `${f.id} lost RTK fix`);
    } else if (!f.hasFix) {
      f.fixRecoverS -= dt;
      if (f.fixRecoverS <= 0) {
        f.hasFix = true;
        log("info", "DGPS", `${f.id} RTK fix restored`);
      }
    }

    let budget = dt;
    // Loop so large dt values still advance through several phases.
    while (budget > 0 && f.phase !== "done") {
      const task = tasks[f.taskIndex];
      if (!task) { f.phase = "done"; break; }

      if (f.phase === "moving") {
        const r = moveToward(f.position, task.position, crew.vibrator.moveSpeedMps * budget);
        const used = Math.hypot(r.pos.x - f.position.x, r.pos.y - f.position.y) / crew.vibrator.moveSpeedMps;
        f.position = r.pos;
        budget -= r.arrived ? used : budget;
        if (r.arrived) f.phase = "waitingFix";
        continue;
      }
      if (f.phase === "waitingFix") {
        if (!f.hasFix) break;
        f.phase = "waitingRecorder";
        continue;
      }
      if (f.phase === "waitingRecorder") {
        if (!recorder.ready || recorder.busyRemainingS > 0) break;
        recorder = { ...recorder, busyRemainingS: opts.recordSeconds };
        f.phase = "sweeping";
        f.phaseRemainingS = occupancyPerSweep;
        continue;
      }
      // sweeping / listening count down
      const use = Math.min(budget, f.phaseRemainingS);
      f.phaseRemainingS -= use;
      budget -= use;
      if (f.phaseRemainingS > 1e-9) break;

      if (f.phase === "sweeping") {
        f.phase = "listening";
        f.phaseRemainingS = crew.vibrator.listenSeconds;
      } else {
        recorder = { ...recorder, shotRecords: recorder.shotRecords + 1 };
        f.sweepIndex += 1;
        if (f.sweepIndex < crew.vibrator.sweepsPerVp) {
          f.phase = "waitingRecorder";
        } else {
          f.completedVps += 1;
          log("info", f.id, `VP ${task.sourcePointId} complete`);
          f.sweepIndex = 0;
          f.taskIndex += 1;
          f.phase = f.taskIndex < tasks.length ? "moving" : "done";
          if (f.phase === "done") log("info", f.id, "Swath complete — fleet released");
        }
      }
    }
    return f;
  });

  const finished = fleets.every((f) => f.phase === "done");
  if (finished) log("info", "Crew", `Acquisition complete — ${recorder.shotRecords} shot records`);
  return { t, fleets, nodes, recorder, repair, events, finished };
}

export interface SimSummary {
  progress: number; // 0–1
  completedVps: number;
  totalVps: number;
  nodesOk: number;
  nodesTotal: number;
  fleetsWithoutFix: number;
}

export function summarize(state: SimState, plan: ExecutionPlan): SimSummary {
  const completedVps = state.fleets.reduce((a, f) => a + f.completedVps, 0);
  return {
    progress: plan.totalPoints ? completedVps / plan.totalPoints : 1,
    completedVps,
    totalVps: plan.totalPoints,
    nodesOk: state.nodes.filter((n) => n.ok).length,
    nodesTotal: state.nodes.length,
    fleetsWithoutFix: state.fleets.filter((f) => !f.hasFix).length,
  };
}
