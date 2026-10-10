/** Called only after schema initialization and the HTTP listening callback.
 * Existing published content remains available during idempotent refreshes.
 * Import workers start after refresh so they cannot race queued source jobs. */
export async function runStartupMaintenance({ refresh, onFailure, startWorker }: {
  refresh?: (() => Promise<unknown>) | undefined;
  onFailure: (error: unknown) => void;
  startWorker: () => void;
}): Promise<void> {
  try { if (refresh) await refresh(); }
  catch (error) { onFailure(error); }
  finally { startWorker(); }
}

/** Each review owns its transaction; stale source metadata must not block
 * independent exam archives. Keep order to avoid racing import workers. */
export async function runIndependentContentReviews(steps: Array<{ name: string; run: () => Promise<unknown> }>, onFailure: (name: string, error: unknown) => void): Promise<void> {
  for (const step of steps) {
    try { await step.run(); }
    catch (error) { onFailure(step.name, error); }
  }
}
