"use client";

import { useEffect, useState } from "react";
import type { AdminUser, AssignableRole } from "@shared/index";
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
  const [filter, setFilter] = useState("");

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

  async function changeRole(user: AdminUser, role: AssignableRole) {
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
        تعيين صلاحيات المدير أو المدرب أو المتدرب، وإيقاف الحسابات أو إعادة تفعيلها.
        يستطيع المدرب مشاهدة آراء المشاركين وإدارتها.
      </p>

      {error ? <ErrorState message={error} retryHref="/admin/users" /> : null}
      {!error && users === null ? <LoadingState label="Loading users…" /> : null}
      {!error && users && users.length === 0 ? <EmptyState title="No users yet" message="Users appear here once they first sign in." /> : null}

      {!error && users && users.length > 0 ? (
        <>
          <div className="form-field" style={{ maxWidth: "20rem", marginBottom: "var(--space-3)" }}>
            <label className="form-label" htmlFor="user-filter">
              Filter by email
            </label>
            <input
              id="user-filter"
              className="form-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search users…"
            />
          </div>
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
              {users
                .filter((user) => user.email.toLowerCase().includes(filter.toLowerCase()))
                .map((user) => (
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
                      <ConfirmButton
                        label={user.role === "instructor" ? "إزالة صلاحية المدرب" : "تعيين مدرب"}
                        confirmTitle={user.role === "instructor" ? "إزالة صلاحية المدرب؟" : "تعيين هذا المستخدم مدربًا؟"}
                        confirmMessage={user.role === "instructor" ? "سيصبح المستخدم متدربًا ولن يستطيع مشاهدة آراء المشاركين." : `${user.email} سيتمكن من مشاهدة آراء المشاركين وإدارتها.${user.role === "admin" ? " وسيتم استبدال صلاحية المدير بصلاحية المدرب." : ""}`}
                        onConfirm={() => changeRole(user, user.role === "instructor" ? "user" : "instructor")}
                        variant="default"
                        confirmLabel="تأكيد" cancelLabel="إلغاء" busyLabel="جارٍ الحفظ…"
                        errorMessage="تعذر تعديل الصلاحية. حاول مرة أخرى."
                      />
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
        </>
      ) : null}
    </section>
  );
}
