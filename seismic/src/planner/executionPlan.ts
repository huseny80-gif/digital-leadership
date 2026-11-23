import { distance, vpOccupancySeconds, type CrewConfig, type Position } from "../domain/equipment";
import type { SourcePoint } from "../domain/survey";

export interface PlannedTask {
  sourcePointId: string;
  position: Position;
  /** Seconds from plan start the fleet arrives at the VP. */
  arriveAtS: number;
  /** Seconds from plan start the fleet releases the VP. */
  completeAtS: number;
}

export interface FleetPlan {
  fleetId: string;
  lines: number[];
  tasks: PlannedTask[];
  travelM: number;
  durationS: number;
}

export interface ExecutionPlan {
  fleets: FleetPlan[];
  totalPoints: number;
  /** Wall-clock makespan: the slowest fleet's duration. */
  makespanS: number;
  /** Productivity estimate, VPs per hour across the crew. */
  vpPerHour: number;
}

export class PlanningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanningError";
  }
}

/**
 * Splits source lines across fleets as evenly as possible, contiguous blocks
 * so fleets never cross each other's swaths.
 */
export function allocateLines(lines: number[], fleets: number): number[][] {
  if (fleets < 1) throw new PlanningError("At least one fleet is required");
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const out: number[][] = Array.from({ length: fleets }, () => []);
  const base = Math.floor(sorted.length / fleets);
  const extra = sorted.length % fleets;
  let cursor = 0;
  for (let f = 0; f < fleets; f++) {
    const take = base + (f < extra ? 1 : 0);
    out[f] = sorted.slice(cursor, cursor + take);
    cursor += take;
  }
  return out;
}

/** Boustrophedon (snake) ordering — alternate direction on each line. */
export function snakeOrder(points: SourcePoint[], lines: number[]): SourcePoint[] {
  const ordered: SourcePoint[] = [];
  lines.forEach((line, i) => {
    const onLine = points.filter((p) => p.line === line).sort((a, b) => a.station - b.station);
    ordered.push(...(i % 2 === 0 ? onLine : onLine.reverse()));
  });
  return ordered;
}

/**
 * Builds the automated execution plan: line allocation, VP ordering and a
 * time-phased schedule per fleet. Pure and deterministic.
 */
export function buildExecutionPlan(points: SourcePoint[], crew: CrewConfig, start: Position = { x: 0, y: 0 }): ExecutionPlan {
  if (points.length === 0) throw new PlanningError("Survey has no source points");
  const ids = new Set<string>();
  for (const p of points) {
    if (ids.has(p.id)) throw new PlanningError(`Duplicate source point id ${p.id}`);
    ids.add(p.id);
  }
  const occupancy = vpOccupancySeconds(crew.vibrator);
  const speed = crew.vibrator.moveSpeedMps;
  if (speed <= 0) throw new PlanningError("moveSpeedMps must be > 0");

  const allocation = allocateLines(points.map((p) => p.line), crew.vibratorFleets);
  const fleets: FleetPlan[] = allocation.map((lines, i) => {
    const ordered = snakeOrder(points, lines);
    let clock = 0;
    let travel = 0;
    let at = start;
    const tasks = ordered.map((p) => {
      const leg = distance(at, p.position);
      travel += leg;
      clock += leg / speed;
      const arriveAtS = clock;
      clock += occupancy;
      at = p.position;
      return { sourcePointId: p.id, position: p.position, arriveAtS, completeAtS: clock };
    });
    return { fleetId: `F${i + 1}`, lines, tasks, travelM: travel, durationS: clock };
  });

  const makespanS = Math.max(...fleets.map((f) => f.durationS));
  return {
    fleets,
    totalPoints: points.length,
    makespanS,
    vpPerHour: makespanS > 0 ? (points.length / makespanS) * 3600 : 0,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
