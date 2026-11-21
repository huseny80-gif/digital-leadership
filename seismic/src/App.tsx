import { lazy, Suspense, useMemo } from "react";
import { SimulationControls } from "./components/SimulationControls";
import { StatTile } from "./components/StatTile";
import { FleetTable } from "./components/FleetTable";
import { EventLog } from "./components/EventLog";
import { GlassCard } from "./components/GlassCard";
import { SyncStatus } from "./components/SyncStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { StatusBadge } from "./components/StatusBadge";
import { useSimulation } from "./store/simulationStore";
import { useSimulationClock } from "./store/useSimulationClock";
import { summarize } from "./simulation/engine";
import { formatDuration } from "./planner/executionPlan";
import { hasWebGL } from "./scene/sceneMath";
import { httpSender, SyncQueue } from "./offline/syncQueue";
import { EQUIPMENT_LABELS } from "./domain/equipment";

const FieldOffice3D = lazy(() => import("./scene/FieldOffice3D"));

export interface AppProps {
  queue?: SyncQueue;
  getToken?: () => Promise<string | null>;
  webgl?: boolean;
}

export function App({ queue: injectedQueue, getToken = async () => null, webgl }: AppProps) {
  useSimulationClock();
  const queue = useMemo(() => injectedQueue ?? new SyncQueue(), [injectedQueue]);
  const plan = useSimulation((s) => s.plan);
  const sim = useSimulation((s) => s.sim);
  const error = useSimulation((s) => s.error);
  const summary = summarize(sim, plan);
  const canRender3D = webgl ?? hasWebGL();
  const endpoint = import.meta.env.VITE_SYNC_ENDPOINT ?? "/api/seismic/sync";

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to dashboard</a>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <h1><span className="gold-text">7th Seismic Crew</span> · Operations Center</h1>
            <p className="subtitle">Digital leadership platform · Vibroseis acquisition twin</p>
          </div>
        </div>
        <SimulationControls />
      </header>

      {error && <p role="alert" className="alert">{error}</p>}

      <main id="main" className="grid">
        <StatTile title="Production" value={`${summary.completedVps}/${summary.totalVps}`} label="Vibrator points acquired" progress={summary.progress} />
        <StatTile title="Shot records" value={String(sim.recorder.shotRecords)} label={`${EQUIPMENT_LABELS.recorder} · ${sim.recorder.ready ? "ready" : "holding"}`} />
        <StatTile title="Spread health" value={`${summary.nodesOk}/${summary.nodesTotal}`} label="Wireless nodes in spec" progress={summary.nodesTotal ? summary.nodesOk / summary.nodesTotal : 1} />
        <StatTile title="Sim clock" value={formatDuration(sim.t)} label={`Plan makespan ${formatDuration(plan.makespanS)} · ${plan.vpPerHour.toFixed(0)} VP/h`} />

        <GlassCard title="Virtual field office · 3D" className="span-8 scene-wrap">
          {canRender3D ? (
            <ErrorBoundary fallback={() => <div className="scene-fallback">3D view unavailable on this device. Dashboard data remains live.</div>}>
              <Suspense fallback={<div className="scene-fallback">Loading 3D field office…</div>}>
                <FieldOffice3D />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <div className="scene-fallback">WebGL is not available. Dashboard data remains live.</div>
          )}
          <div className="scene-legend" aria-hidden="true">
            <StatusBadge tone="active">Vibrator</StatusBadge>
            <StatusBadge tone="ok">Node OK</StatusBadge>
            <StatusBadge tone="error">Fault / no fix</StatusBadge>
          </div>
        </GlassCard>
        <EventLog />
        <FleetTable />
        <SyncStatus
          queue={queue}
          onReport={async () => {
            await queue.enqueue("production", { simTimeS: sim.t, completedVps: summary.completedVps, shotRecords: sim.recorder.shotRecords });
          }}
          onFlush={async () => {
            const r = await queue.flush(httpSender(endpoint, getToken));
            if (r.failed || r.dropped) throw new Error(`${r.sent} sent, ${r.failed} will retry, ${r.dropped} rejected`);
          }}
        />
      </main>
    </div>
  );
}
