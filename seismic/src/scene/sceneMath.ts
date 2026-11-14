import type { Position } from "../domain/equipment";
import { surveyBounds } from "../domain/survey";

/** Maps survey metres to scene units centred on the origin (x→x, northing→-z). */
export function makeProjector(points: Position[], worldSize = 14) {
  const b = surveyBounds(points);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
  const scale = worldSize / span;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return (p: Position): [number, number, number] => [(p.x - cx) * scale, 0, -(p.y - cy) * scale];
}

export function hasWebGL(doc: Document | undefined = globalThis.document): boolean {
  try {
    const c = doc?.createElement("canvas");
    return !!(c && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}
