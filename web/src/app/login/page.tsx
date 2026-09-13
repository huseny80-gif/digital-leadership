/**
 * Login screen (structural placeholder).
 *
 * Per ARCHITECTURE.md §5 / ARCHITECTURE_DIAGRAM.md §2, the real
 * implementation (Phase 6) wires this to Google OAuth via the pluggable
 * identity-provider layer, then exchanges the resulting identity for a
 * backend-issued session. No authentication logic is implemented here yet.
 */
export default function LoginPage() {
  return (
    <main>
      <h1>Login</h1>
      <p>Structural placeholder. Sign-in with Google will be implemented in Phase 6.</p>
      <button type="button" disabled>
        Sign in with Google (not yet implemented)
      </button>
    </main>
  );
}
