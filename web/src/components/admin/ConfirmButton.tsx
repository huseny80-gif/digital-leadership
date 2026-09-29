"use client";

import { useState } from "react";

/**
 * A destructive-action button that requires an explicit confirmation
 * step before firing (PHASE 09C "Destructive Operations" /
 * "Confirmation dialogs work"). This dialog is a UX courtesy only — it
 * is NOT the security control; the backend independently re-validates
 * and can still refuse the operation (e.g. a dependency check, a
 * self-lockout guard) after the admin confirms here.
 */
export function ConfirmButton({
  label,
  confirmTitle,
  confirmMessage,
  onConfirm,
  variant = "danger",
}: {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  onConfirm: () => Promise<void>;
  variant?: "danger" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      setError("This action could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={variant === "danger" ? "btn btn-secondary" : "btn"}
        style={variant === "danger" ? { color: "var(--color-danger)", borderColor: "var(--color-danger)" } : undefined}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <div className="confirm-dialog-backdrop" role="presentation" onClick={() => !busy && setOpen(false)}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-dialog-title" className="state-title">
              {confirmTitle}
            </h2>
            <p className="state-message">{confirmMessage}</p>
            {error ? (
              <p role="alert" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : null}
            <div className="form-actions">
              <button type="button" className="btn" onClick={handleConfirm} disabled={busy}>
                {busy ? "Working…" : "Confirm"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
