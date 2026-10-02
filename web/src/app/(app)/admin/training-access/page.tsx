"use client";

import { useEffect, useState } from "react";
import type { TrainingAccessGrant, TrainingAccessGrantCreated, Subject, GuestTraineeAnalyticsRow } from "@shared/index";
import { adminGet, adminPost, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { TrainingAccessQrCode } from "@/components/admin/TrainingAccessQrCode";

/**
 * Phase 6 admin console screen: create, list, and revoke Training Access
 * grants (task requirement #9). Follows the same list/create-form/table
 * shape as `admin/subjects/page.tsx` for consistency with the rest of the
 * admin console, rather than inventing a new layout style.
 *
 * The raw join token/URL is shown ONLY in the "just created" panel,
 * immediately after `POST /admin/training-access` returns it — the list
 * below never re-displays it (the backend never returns it again either;
 * only its hash is stored). A client-side-generated QR code (the `qrcode`
 * npm package — see `TrainingAccessQrCode`) accompanies that same
 * one-time link, encoding nothing but the join URL itself.
 *
 * The trainee analytics table below reads a NEW admin-only endpoint
 * (`GET /admin/training-access/guests`) — never any guest-facing route,
 * which never returns more than the calling guest's own session.
 */
export default function TrainingAccessPage() {
  const [grants, setGrants] = useState<TrainingAccessGrant[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [guestAnalytics, setGuestAnalytics] = useState<GuestTraineeAnalyticsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [label, setLabel] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(24 * 7);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<TrainingAccessGrantCreated | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  // Captured once via a lazy initializer (not re-evaluated on every
  // render) so the expiry check below never calls the impure `Date.now()`
  // during render itself (react-hooks/purity) — a grant's expired/active
  // status only needs to be "as of this page load", not live-ticking.
  const [now] = useState(() => Date.now());

  async function load() {
    setError(null);
    try {
      const [grantsData, subjectsData, guestAnalyticsData] = await Promise.all([
        adminGet<TrainingAccessGrant[]>("training-access"),
        adminGet<Subject[]>("subjects"),
        adminGet<GuestTraineeAnalyticsRow[]>("training-access/guests"),
      ]);
      setGrants(grantsData);
      setSubjects(subjectsData);
      setGuestAnalytics(guestAnalyticsData);
    } catch {
      setError("Unable to load training access grants. Please try again.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await adminPost<TrainingAccessGrantCreated>("training-access", {
        subjectId,
        label: label || null,
        description: null,
        maxSessions: null,
        expiresInHours,
      });
      setJustCreated(created);
      setLabel("");
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof AdminApiError ? err.message : "Unable to create the access link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    await adminPost(`training-access/${id}/revoke`);
    await load();
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("Link copied.");
    } catch {
      setCopyStatus("Unable to copy automatically — please copy the link manually.");
    }
    setTimeout(() => setCopyStatus(null), 3000);
  }

  return (
    <section>
      <div className="admin-toolbar">
        <h1 className="page-heading" style={{ marginBottom: 0 }}>
          Training Access
        </h1>
        <button type="button" className="btn" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Cancel" : "New Access Link"}
        </button>
      </div>

      {justCreated ? (
        <div
          className="admin-form"
          style={{ marginBottom: "var(--space-6)", background: "var(--color-success-bg)", border: "1px solid var(--color-success)" }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Access link created — copy it now, it will not be shown again.</p>
          <p style={{ wordBreak: "break-all", fontFamily: "monospace", background: "var(--color-surface)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)" }}>
            {justCreated.joinUrl}
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => copyLink(justCreated.joinUrl)}>
              Copy link
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setJustCreated(null)}>
              Dismiss
            </button>
          </div>
          {copyStatus && <p role="status">{copyStatus}</p>}
          <div style={{ marginTop: "var(--space-4)" }}>
            <TrainingAccessQrCode joinUrl={justCreated.joinUrl} label={justCreated.label ?? justCreated.subjectTitle} />
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <form className="admin-form" onSubmit={handleCreate} style={{ marginBottom: "var(--space-6)" }}>
          <div className="form-field">
            <label className="form-label" htmlFor="grant-subject">
              Subject
            </label>
            <select id="grant-subject" className="form-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              <option value="" disabled>
                Select a subject…
              </option>
              {(subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="grant-label">
              Label (optional)
            </label>
            <input id="grant-label" className="form-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Q3 onboarding cohort" />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="grant-expires">
              Expires in (hours)
            </label>
            <input
              id="grant-expires"
              type="number"
              min={1}
              className="form-input"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              required
            />
          </div>
          {formError ? (
            <p role="alert" style={{ color: "var(--color-danger)" }}>
              {formError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting || !subjectId}>
              {submitting ? "Creating…" : "Create Access Link"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <ErrorState message={error} retryHref="/admin/training-access" /> : null}
      {!error && grants === null ? <LoadingState label="Loading training access grants…" /> : null}
      {!error && grants && grants.length === 0 ? (
        <EmptyState title="No training access links yet" message="Create your first access link above." />
      ) : null}

      {!error && grants && grants.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Label</th>
                <th>Sessions</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => {
                const expired = new Date(g.expiresAt).getTime() <= now;
                const statusLabel = g.revoked ? "Revoked" : expired ? "Expired" : "Active";
                return (
                  <tr key={g.id}>
                    <td>{g.subjectTitle}</td>
                    <td>{g.label ?? "—"}</td>
                    <td>
                      {g.sessionCount}
                      {g.maxSessions ? ` / ${g.maxSessions}` : ""}
                    </td>
                    <td>{statusLabel}</td>
                    <td>{new Date(g.expiresAt).toLocaleString()}</td>
                    <td>{new Date(g.createdAt).toLocaleString()}</td>
                    <td>
                      {!g.revoked ? (
                        <ConfirmButton
                          label="Revoke"
                          confirmTitle="Revoke this access link?"
                          confirmMessage="Guests will no longer be able to join using this link. Sessions already in progress are not affected."
                          onConfirm={() => handleRevoke(g.id)}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <h2 className="page-heading" style={{ fontSize: "var(--font-size-lg)", marginTop: "var(--space-6)" }}>
        Guest Trainees
      </h2>
      {!error && guestAnalytics && guestAnalytics.length === 0 ? (
        <EmptyState title="No guests yet" message="Trainees who join via a link above will appear here." />
      ) : null}
      {!error && guestAnalytics && guestAnalytics.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Subject</th>
                <th>Joined</th>
                <th>Last active</th>
                <th>Status</th>
                <th>Lectures</th>
                <th>Quizzes started</th>
                <th>Quizzes completed</th>
                <th>Avg. score</th>
              </tr>
            </thead>
            <tbody>
              {guestAnalytics.map((r) => (
                <tr key={r.guestSessionId}>
                  <td>{r.displayName}</td>
                  <td>{r.subjectTitle}</td>
                  <td>{new Date(r.joinedAt).toLocaleString()}</td>
                  <td>{new Date(r.lastSeenAt).toLocaleString()}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.lecturesCompleted} / {r.totalLectures}
                  </td>
                  <td>{r.quizzesStarted}</td>
                  <td>{r.quizzesCompleted}</td>
                  <td>{r.averageScore !== null ? r.averageScore.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
