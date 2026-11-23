import { useSimulation } from "../store/simulationStore";

export function SimulationControls() {
  const running = useSimulation((s) => s.running);
  const finished = useSimulation((s) => s.sim.finished);
  const speed = useSimulation((s) => s.speed);
  const setRunning = useSimulation((s) => s.setRunning);
  const setSpeed = useSimulation((s) => s.setSpeed);
  const reset = useSimulation((s) => s.reset);
  const seed = useSimulation((s) => s.seed);

  return (
    <div className="toolbar" role="group" aria-label="Simulation controls">
      <button className="btn btn-primary" onClick={() => setRunning(!running)} disabled={finished} aria-pressed={running}>
        {running ? "Pause" : finished ? "Completed" : "Start acquisition"}
      </button>
      <button className="btn" onClick={() => reset()}>Reset</button>
      <button className="btn" onClick={() => reset(seed + 1)}>New scenario</button>
      <label>
        Speed
        <input type="range" min={1} max={600} step={1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={`${speed} times real time`} />
        <output>{speed}×</output>
      </label>
    </div>
  );
}
