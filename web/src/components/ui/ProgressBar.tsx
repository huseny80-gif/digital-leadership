/**
 * Phase 21.1 — Student Experience Upgrade: a visual progress indicator
 * for a real, server-computed percentage (e.g. `QuizAttemptResult.percentage`
 * — never a client-derived or placeholder value). `label`/`valueLabel` are
 * plain text so callers stay in control of wording (e.g. "72%" vs
 * "18 / 25 correct"); this component only owns the bar's visuals.
 */
export function ProgressBar({
  label,
  percentage,
  valueLabel,
  tone,
}: {
  label: string;
  /** 0–100, already computed by the server. Clamped defensively in case
   * of a rounding edge case, never used to compute a score itself. */
  percentage: number;
  valueLabel?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const clamped = Math.max(0, Math.min(100, percentage));

  return (
    <div className="progress-bar">
      <div className="progress-bar-labels">
        <span>{label}</span>
        <span className="progress-bar-value">{valueLabel ?? `${Math.round(clamped)}%`}</span>
      </div>
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="progress-bar-fill"
          data-tone={tone && tone !== "default" ? tone : undefined}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
