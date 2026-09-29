import type { ReactNode } from "react";
import type { UserProfile } from "@shared/index";
import { apiGet } from "@/lib/api/client";
import { UnauthorizedState } from "@/components/ui/States";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

/**
 * Admin Console layout (PHASE 09C "Admin Shell" / "Admin Route"). This
 * role check is frontend defense-in-depth ONLY — every admin API call
 * this section's pages make is independently re-authorized by the
 * backend's own `requireAdmin` (Phase 6, unmodified). A bug here could
 * at most show a non-admin the admin page shell; it could never let them
 * actually read or write admin data, since every request still goes
 * through the same backend gate `ADMIN_SECURITY.md` documents.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let isAdmin = false;
  try {
    const { data } = await apiGet<UserProfile>("/api/v1/me");
    isAdmin = data.role === "admin";
  } catch {
    isAdmin = false;
  }

  if (!isAdmin) {
    return <UnauthorizedState message="The Admin Console is only available to administrators." />;
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-content">{children}</div>
    </div>
  );
}
