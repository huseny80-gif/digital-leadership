import type { Position } from "./equipment";

/** A vibrator point (source point) on the survey grid. */
export interface SourcePoint {
  id: string; // e.g. "S1012-P2040"
  line: number;
  station: number;
  position: Position;
}

export interface ReceiverStation {
  id: string;
  line: number;
  station: number;
  position: Position;
}

export interface SurveyGeometry {
  sourceLines: number;
  pointsPerSourceLine: number;
  sourceLineSpacingM: number;
  sourcePointIntervalM: number;
  receiverLines: number;
  stationsPerReceiverLine: number;
  receiverLineSpacingM: number;
  receiverStationIntervalM: number;
}

export const DEMO_GEOMETRY: SurveyGeometry = {
  sourceLines: 4,
  pointsPerSourceLine: 12,
  sourceLineSpacingM: 200,
  sourcePointIntervalM: 50,
  receiverLines: 3,
  stationsPerReceiverLine: 16,
  receiverLineSpacingM: 250,
  receiverStationIntervalM: 40,
};

function assertPositiveInt(name: string, v: number) {
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`${name} must be a positive integer`);
}

/** Source lines run along x (easting); lines are stacked in y. */
export function buildSourcePoints(g: SurveyGeometry): SourcePoint[] {
  assertPositiveInt("sourceLines", g.sourceLines);
  assertPositiveInt("pointsPerSourceLine", g.pointsPerSourceLine);
  const out: SourcePoint[] = [];
  for (let l = 0; l < g.sourceLines; l++) {
    for (let s = 0; s < g.pointsPerSourceLine; s++) {
      const line = 1001 + l;
      const station = 2001 + s;
      out.push({
        id: `S${line}-P${station}`,
        line,
        station,
        position: { x: s * g.sourcePointIntervalM, y: l * g.sourceLineSpacingM },
      });
    }
  }
  return out;
}

/** Receiver lines run along y (orthogonal geometry), stacked in x. */
export function buildReceiverStations(g: SurveyGeometry): ReceiverStation[] {
  assertPositiveInt("receiverLines", g.receiverLines);
  assertPositiveInt("stationsPerReceiverLine", g.stationsPerReceiverLine);
  const out: ReceiverStation[] = [];
  for (let l = 0; l < g.receiverLines; l++) {
    for (let s = 0; s < g.stationsPerReceiverLine; s++) {
      const line = 5001 + l;
      const station = 7001 + s;
      out.push({
        id: `R${line}-S${station}`,
        line,
        station,
        position: { x: 50 + l * g.receiverLineSpacingM, y: s * g.receiverStationIntervalM - 100 },
      });
    }
  }
  return out;
}

export function surveyBounds(points: Position[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (points.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}
