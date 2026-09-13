import type { ReactNode } from "react";

/**
 * Application shell (structural placeholder).
 *
 * Wraps every authenticated route under `src/app/(app)`. In later phases
 * this will render role-aware navigation (Admin vs. User, per
 * ARCHITECTURE.md §2.1) sourced from the backend-provided session/role —
 * it renders static placeholder navigation for now.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <header>
        <nav aria-label="Primary">
          <span>Digital Leadership</span>
          {/* Structural placeholders — not wired to routing/auth state yet */}
          <span> | Dashboard</span>
          <span> | Subjects</span>
          <span> | Admin</span>
          <span> | Profile</span>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
