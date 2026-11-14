import type { FleetPhase } from "../simulation/engine";

export type Tone = "ok" | "warn" | "error" | "idle" | "active";

const PHASE_TONE: Record<FleetPhase, Tone> = {
  moving: "idle",
  waitingFix: "warn",
  waitingRecorder: "warn",
  sweeping: "active",
  listening: "active",
  done: "ok",
};

const PHASE_LABEL: Record<FleetPhase, string> = {
  moving: "Moving up",
  waitingFix: "Waiting DGPS fix",
  waitingRecorder: "Waiting recorder",
  sweeping: "Sweeping",
  listening: "Listening",
  done: "Complete",
};

export function phaseTone(p: FleetPhase): Tone {
  return PHASE_TONE[p];
}

export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PhaseBadge({ phase }: { phase: FleetPhase }) {
  return <StatusBadge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</StatusBadge>;
}
