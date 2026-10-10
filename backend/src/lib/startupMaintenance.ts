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
