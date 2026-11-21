/**
 * Field equipment model for the 7th Seismic Crew.
 *
 * Numeric parameters are SIMULATION DEFAULTS, not manufacturer
 * specifications. Override them from crew configuration with the values from
 * the equipment datasheets and the project's acquisition parameters.
 */
export type EquipmentKind =
  | "vibrator" // Nomad 65 Neo vibrator truck
  | "recorder" // Sercel 508XT central recording system
  | "wirelessNode" // autonomous wireless recording node
  | "geophone" // geophone string on a receiver station
  | "dgps"; // DGPS rover / base station

export type EquipmentStatus = "idle" | "active" | "moving" | "fault" | "offline";

export interface Position {
  /** Easting in metres within the survey grid. */
  x: number;
  /** Northing in metres within the survey grid. */
  y: number;
}

export interface Equipment {
  id: string;
  kind: EquipmentKind;
  label: string;
  status: EquipmentStatus;
  position: Position;
}

export interface VibratorParams {
  /** Sweep length in seconds. */
  sweepSeconds: number;
  /** Sweeps stacked per vibrator point. */
  sweepsPerVp: number;
  /** Listen time after each sweep, seconds. */
  listenSeconds: number;
  /** Average move-up speed between points, metres/second. */
  moveSpeedMps: number;
}

export const DEFAULT_VIBRATOR_PARAMS: VibratorParams = {
  sweepSeconds: 12,
  sweepsPerVp: 2,
  listenSeconds: 6,
  moveSpeedMps: 2.5,
};

export interface CrewConfig {
  vibratorFleets: number;
  /** Trucks per fleet sweeping in unison on one VP. */
  trucksPerFleet: number;
  vibrator: VibratorParams;
  /** Probability (0–1) per tick that a DGPS rover loses RTK fix. */
  dgpsDropoutRate: number;
  /** Probability (0–1) per tick that a wireless node reports a fault. */
  nodeFaultRate: number;
}

export const DEFAULT_CREW_CONFIG: CrewConfig = {
  vibratorFleets: 3,
  trucksPerFleet: 2,
  vibrator: DEFAULT_VIBRATOR_PARAMS,
  dgpsDropoutRate: 0.01,
  nodeFaultRate: 0.002,
};

export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  vibrator: "Nomad 65 Neo",
  recorder: "Sercel 508XT",
  wirelessNode: "Wireless Node",
  geophone: "Geophone String",
  dgps: "DGPS",
};

/** Seconds a fleet spends on one VP: all sweeps plus their listen times. */
export function vpOccupancySeconds(p: VibratorParams): number {
  if (p.sweepSeconds <= 0 || p.sweepsPerVp <= 0 || p.listenSeconds < 0) {
    throw new RangeError("Vibrator parameters must be positive");
  }
  return p.sweepsPerVp * (p.sweepSeconds + p.listenSeconds);
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function validateCrewConfig(c: CrewConfig): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(c.vibratorFleets) || c.vibratorFleets < 1) errors.push("vibratorFleets must be an integer ≥ 1");
  if (!Number.isInteger(c.trucksPerFleet) || c.trucksPerFleet < 1) errors.push("trucksPerFleet must be an integer ≥ 1");
  if (c.vibrator.moveSpeedMps <= 0) errors.push("moveSpeedMps must be > 0");
  for (const [k, v] of [["dgpsDropoutRate", c.dgpsDropoutRate], ["nodeFaultRate", c.nodeFaultRate]] as const) {
    if (v < 0 || v > 1) errors.push(`${k} must be within [0, 1]`);
  }
  try {
    vpOccupancySeconds(c.vibrator);
  } catch {
    errors.push("vibrator sweep parameters must be positive");
  }
  return errors;
}
