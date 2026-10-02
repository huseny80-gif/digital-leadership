/**
 * Shown by `(app)/layout.tsx` when a `training_guest_session` cookie is
 * present (so `proxy.ts` let the request through) but the backend's own
 * verification of it fails — expired, revoked, or forged. Never a
 * redirect to `/login`: a guest has no Google/Supabase account to sign
 * back into there (task constraint — Guest is never converted into a
 * permanent User). The only way back in is the original training
 * link/QR code.
 */
export function SessionExpiredState() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-5)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          padding: "var(--space-6)",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "var(--font-size-lg)", margin: "0 0 var(--space-3)" }}>Your training session has ended</h1>
        <p style={{ color: "var(--color-text-muted)" }}>
          Your training session has expired or could not be found. Please use your training link or QR code again to rejoin.
        </p>
        <p style={{ marginTop: "var(--space-5)" }}>
          <a href="/about" style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
            من نحن
          </a>
        </p>
      </div>
    </div>
  );
}
