import { useSimulation } from "../store/simulationStore";
import { GlassCard } from "./GlassCard";
import { formatDuration } from "../planner/executionPlan";

export function EventLog() {
  const events = useSimulation((s) => s.sim.events);
  const recent = events.slice(-40).reverse();
  return (
    <GlassCard title="Operations log" className="span-4">
      <ul className="event-log" aria-live="polite" aria-relevant="additions">
        {recent.map((e, i) => (
          <li key={`${e.t}-${i}-${e.message}`}>
            <time>{formatDuration(e.t)}</time>
            <span className={`lvl-${e.level}`}>{e.source}</span>
            <span>{e.message}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
