import { useSimulation } from "../store/simulationStore";
import { PhaseBadge, StatusBadge } from "./StatusBadge";
import { GlassCard } from "./GlassCard";
import { EQUIPMENT_LABELS } from "../domain/equipment";

export function FleetTable() {
  const fleets = useSimulation((s) => s.sim.fleets);
  const plan = useSimulation((s) => s.plan);
  return (
    <GlassCard title={`Vibrator fleets · ${EQUIPMENT_LABELS.vibrator}`} className="span-8">
      <table className="table">
        <thead>
          <tr><th scope="col">Fleet</th><th scope="col">Lines</th><th scope="col">Status</th><th scope="col">DGPS</th><th scope="col">VPs</th></tr>
        </thead>
        <tbody>
          {fleets.map((f, i) => {
            const fp = plan.fleets[i];
            return (
              <tr key={f.id}>
                <th scope="row">{f.id}</th>
                <td>{fp?.lines.join(", ") || "—"}</td>
                <td><PhaseBadge phase={f.phase} /></td>
                <td>{f.hasFix ? <StatusBadge tone="ok">RTK fix</StatusBadge> : <StatusBadge tone="error">No fix</StatusBadge>}</td>
                <td>{f.completedVps} / {fp?.tasks.length ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GlassCard>
  );
}
