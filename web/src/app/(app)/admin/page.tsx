/**
 * Admin console entry point (structural placeholder).
 *
 * Every route under this path must be gated to the `admin` role only, once
 * authorization is implemented in Phase 6 (ARCHITECTURE.md §9,
 * SECURITY_ARCHITECTURE.md §2-3). No such guard exists yet — this route is
 * reachable in scaffolding only because there is no authentication at all
 * in this phase.
 */
export default function AdminPage() {
  return (
    <section>
      <h1>Admin</h1>
      <p>Structural placeholder. Admin-only access will be enforced in Phase 6.</p>
    </section>
  );
}
