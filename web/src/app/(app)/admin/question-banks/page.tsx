"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { QuestionBank } from "@shared/index";
import { adminGet, adminPost, adminDelete, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

/** Question bank management (PHASE 09C "Question Bank Management"). */
export default function AdminQuestionBanksPage() {
  const [banks, setBanks] = useState<QuestionBank[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setBanks(await adminGet<QuestionBank[]>("question-banks"));
    } catch {
      setError("Unable to load question banks. Please try again.");
    }
  }

  useEffect(() => {
    // Fetch-on-mount for a client-rendered admin page: setState calls
    // happen only after the awaited request resolves, not synchronously
    // within the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminPost("question-banks", { title, subjectId: subjectId || null });
      setTitle("");
      setSubjectId("");
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof AdminApiError ? err.message : "Unable to create the question bank. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await adminDelete(`question-banks/${id}`);
    await load();
  }

  return (
    <section>
      <div className="admin-toolbar">
        <h1 className="page-heading" style={{ marginBottom: 0 }}>
          Question Banks
        </h1>
        <button type="button" className="btn" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Cancel" : "New Question Bank"}
        </button>
      </div>

      {formOpen ? (
        <form className="admin-form" onSubmit={handleCreate} style={{ marginBottom: "var(--space-6)" }}>
          <div className="form-field">
            <label className="form-label" htmlFor="bank-title">
              Title
            </label>
            <input id="bank-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="bank-subject-id">
              Subject ID (optional)
            </label>
            <input id="bank-subject-id" className="form-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
          </div>
          {formError ? (
            <p role="alert" style={{ color: "var(--color-danger)" }}>
              {formError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Creating…" : "Create Question Bank"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <ErrorState message={error} retryHref="/admin/question-banks" /> : null}
      {!error && banks === null ? <LoadingState label="Loading question banks…" /> : null}
      {!error && banks && banks.length === 0 ? <EmptyState title="No question banks yet" message="Create one above." /> : null}

      {!error && banks && banks.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {banks.map((bank) => (
                <tr key={bank.id}>
                  <td>
                    <Link href={`/admin/question-banks/${bank.id}`}>{bank.title}</Link>
                  </td>
                  <td>
                    <ConfirmButton
                      label="Delete"
                      confirmTitle="Delete this question bank?"
                      confirmMessage={`"${bank.title}" will be archived. Its questions become inaccessible to new quizzes.`}
                      onConfirm={() => handleDelete(bank.id)}
                    />
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
