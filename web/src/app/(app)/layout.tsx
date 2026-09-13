import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Layout for all authenticated application routes.
 *
 * This route group (`(app)`) is where Phase 6 will add the actual
 * session-guard: an unauthenticated request reaching any route under this
 * group must be redirected to `/login` (ARCHITECTURE.md §5, DATA_FLOW.md
 * "USER Flow"). No guard is implemented yet — this is scaffolding only.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
