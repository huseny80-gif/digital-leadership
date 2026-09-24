/**
 * Root entry point.
 *
 * Per PROJECT_REQUIREMENTS.md §4 and ARCHITECTURE.md §5, the platform must
 * never open directly into the application — every client's first protected
 * entry point is the Login screen. This structural placeholder documents
 * that intent; the actual session check and redirect logic is implemented
 * in Phase 6 (Authentication & Authorization), not here.
 */
export default function RootPage() {
  return (
    <main>
      <h1>Digital Leadership</h1>
      <p>
        Scaffolding phase — this page is a structural placeholder only. In a
        later phase, this route will check for a valid session and route
        unauthenticated visitors to <code>/login</code> and authenticated
        visitors to <code>/dashboard</code>.
      </p>
    </main>
  );
}
