import { createStore, useStore } from "zustand";
import { DEFAULT_CREW_CONFIG, validateCrewConfig, type CrewConfig } from "../domain/equipment";
import { buildReceiverStations, buildSourcePoints, DEMO_GEOMETRY, type SurveyGeometry } from "../domain/survey";
import { buildExecutionPlan, type ExecutionPlan } from "../planner/executionPlan";
import { createSimState, DEFAULT_SIM_OPTIONS, step, type SimState } from "../simulation/engine";
import { createRng, type Rng } from "../simulation/rng";

export interface SimulationStore {
  geometry: SurveyGeometry;
  crew: CrewConfig;
  plan: ExecutionPlan;
  sim: SimState;
  running: boolean;
  /** Simulated seconds per real second. */
  speed: number;
  seed: number;
  error: string | null;
  tick: (realDtS: number) => void;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  reset: (seed?: number) => void;
  configure: (crew: Partial<CrewConfig>) => void;
}

function initial(geometry: SurveyGeometry, crew: CrewConfig, seed: number) {
  const plan = buildExecutionPlan(buildSourcePoints(geometry), crew);
  const sim = createSimState(plan, buildReceiverStations(geometry));
  return { plan, sim, rng: createRng(seed) };
}

/** Factory so tests and multiple 3D views get isolated stores. */
export function createSimulationStore(seed = 7, geometry: SurveyGeometry = DEMO_GEOMETRY, crew: CrewConfig = DEFAULT_CREW_CONFIG) {
  let rng: Rng;
  const boot = initial(geometry, crew, seed);
  rng = boot.rng;

  return createStore<SimulationStore>()((set, get) => ({
    geometry,
    crew,
    plan: boot.plan,
    sim: boot.sim,
    running: false,
    speed: 30,
    seed,
    error: null,
    tick: (realDtS) => {
      const s = get();
      if (!s.running || s.sim.finished || realDtS <= 0) return;
      // Clamp to avoid a giant jump after a backgrounded tab resumes.
      const dt = Math.min(realDtS, 0.25) * s.speed;
      const sim = step(s.sim, dt, s.plan, rng, { ...DEFAULT_SIM_OPTIONS, crew: s.crew });
      set({ sim, running: !sim.finished });
    },
    setRunning: (running) => set({ running: running && !get().sim.finished }),
    setSpeed: (speed) => set({ speed: Math.min(600, Math.max(1, speed)) }),
    reset: (nextSeed) => {
      const s = get();
      const seedToUse = nextSeed ?? s.seed;
      const r = initial(s.geometry, s.crew, seedToUse);
      rng = r.rng;
      set({ plan: r.plan, sim: r.sim, running: false, seed: seedToUse, error: null });
    },
    configure: (patch) => {
      const s = get();
      const crewNext: CrewConfig = { ...s.crew, ...patch, vibrator: { ...s.crew.vibrator, ...patch.vibrator } };
      const errors = validateCrewConfig(crewNext);
      if (errors.length) {
        set({ error: errors.join("; ") });
        return;
      }
      const r = initial(s.geometry, crewNext, s.seed);
      rng = r.rng;
      set({ crew: crewNext, plan: r.plan, sim: r.sim, running: false, error: null });
    },
  }));
}

export type SimulationStoreApi = ReturnType<typeof createSimulationStore>;

export const simulationStore = createSimulationStore();

export function useSimulation<T>(selector: (s: SimulationStore) => T): T {
  return useStore(simulationStore, selector);
}
