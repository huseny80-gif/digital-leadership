"use client";

import { useEffect, useState } from "react";
import type { AdminUser } from "@shared/index";
import { adminGet, adminPatch, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

/**
 * User management (PHASE 09C "User Management" / "Role Management" /
 * "Self-Lockout Protection"). Role and status are the only two mutable
 * fields — no password/login/provider functionality is implemented here.
 * A role change to "admin", or any change that would remove the
 * platform's last admin, requires explicit confirmation and is
 * independently re-validated by the backend regardless of what this
 * dialog allows through.
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function load() {
    setError(null);
    try {
      setUsers(await adminGet<AdminUser[]>("users"));
    } catch {
      setError("Unable to load users. Please try again.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function changeRole(user: AdminUser, role: "admin" | "user") {
    setRowError((prev) => ({ ...prev, [user.id]: "" }));
    try {
      await adminPatch(`users/${user.id}/role`, { role });
      await load();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [user.id]: err instanceof AdminApiError ? err.message : "Unable to change this user's role.",
      }));
    }
  }

  async function changeStatus(user: AdminUser, status: "active" | "suspended") {
    setRowError((prev) => ({ ...prev, [user.id]: "" }));
    try {
      await adminPatch(`users/${user.id}/status`, { status });
      await load();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [user.id]: err instanceof AdminApiError ? err.message : "Unable to change this user's status.",
      }));
    }
  }

  return (
    <section>
      <h1 className="page-heading">Users</h1>
      <p className="page-subheading">
        Assign the existing admin/user roles and suspend/reactivate accounts. Authentication itself remains
        Google/Supabase-based — nothing here manages passwords or logins.
      </p>

      {error ? <ErrorState message={error} retryHref="/admin/users" /> : null}
      {!error && users === null ? <LoadingState label="Loading users…" /> : null}
      {!error && users && users.length === 0 ? <EmptyState title="No users yet" message="Users appear here once they first sign in." /> : null}

      {!error && users && users.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    <span className="badge">{user.role}</span>
                  </td>
                  <td>
                    <span className="badge">{user.status}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      {user.role === "admin" ? (
                        <ConfirmButton
                          label="Demote to User"
                          confirmTitle="Remove admin access?"
                          confirmMessage={`${user.email} will lose administrator access. This is refused if they are the platform's last admin.`}
                          onConfirm={() => changeRole(user, "user")}
                        />
                      ) : (
                        <ConfirmButton
                          label="Promote to Admin"
                          confirmTitle="Grant administrator access?"
                          confirmMessage={`${user.email} will gain full Admin Console access, including user and role management. This action is audit-logged.`}
                          onConfirm={() => changeRole(user, "admin")}
                          variant="default"
                        />
                      )}
                      {user.status === "active" ? (
                        <ConfirmButton
                          label="Suspend"
                          confirmTitle="Suspend this user?"
                          confirmMessage={`${user.email} will be unable to sign in. This is refused if they are the platform's last active admin.`}
                          onConfirm={() => changeStatus(user, "suspended")}
                        />
                      ) : (
                        <button type="button" className="btn btn-secondary" onClick={() => changeStatus(user, "active")}>
                          Reactivate
                        </button>
                      )}
                    </div>
                    {rowError[user.id] ? (
                      <p role="alert" style={{ color: "var(--color-danger)", marginTop: "var(--space-2)" }}>
                        {rowError[user.id]}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
