"use client";

import { useEffect, useState } from "react";
import type { AuditLogEntry, PaginatedResult } from "@shared/index";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

/**
 * Read-only audit log viewer (PHASE 09C "Audit Logging"). Every
 * administrative write this phase performs is recorded here via the
 * existing `audit_logs` table — no secrets, tokens, or signed URLs are
 * ever present in `metadata` (see `lib/audit.ts` and `ADMIN_SECURITY.md`).
 */
export default function AdminAuditLogsPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    let cancelled = false;
    // `adminGet` unwraps the response's `data` field, which works for
    // single-resource endpoints but not this paginated envelope
    // (`{data, page, limit, total}` IS the body — API_V1.md "Pagination
    // Contract") — so this fetches the proxy path directly instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/admin/audit-logs?page=${page}&limit=${limit}`)
      .then((res) => res.json())
      .then((body: PaginatedResult<AuditLogEntry>) => {
        if (cancelled) return;
        setEntries(body.data);
        setTotal(body.total);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load audit logs. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section>
      <h1 className="page-heading">Audit Logs</h1>
      <p className="page-subheading">A record of administrative actions — creates, updates, deletes, publish/unpublish, file operations, and role changes.</p>

      {error ? <ErrorState message={error} retryHref="/admin/audit-logs" /> : null}
      {!error && entries === null ? <LoadingState label="Loading audit logs…" /> : null}
      {!error && entries && entries.length === 0 ? <EmptyState title="No audit log entries yet" message="Administrative actions will appear here." /> : null}

      {!error && entries && entries.length > 0 ? (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.entityType} <span className="item-row-meta">{entry.entityId}</span>
                    </td>
                    <td>{entry.actorUserId ?? "system"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ marginTop: "var(--space-4)" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Previous
            </button>
            <span className="item-row-meta">
              Page {page} of {totalPages}
            </span>
            <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
