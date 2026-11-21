import { GlassCard } from "./GlassCard";

export interface StatTileProps {
  title: string;
  value: string;
  label?: string;
  /** 0–1; renders a progress meter when provided. */
  progress?: number;
}

export function StatTile({ title, value, label, progress }: StatTileProps) {
  const pct = progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <GlassCard title={title} interactive className="span-3">
      <div className="stat-value gold-text">{value}</div>
      {label && <div className="stat-label">{label}</div>}
      {pct !== undefined && (
        <div className="meter" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </GlassCard>
  );
}
