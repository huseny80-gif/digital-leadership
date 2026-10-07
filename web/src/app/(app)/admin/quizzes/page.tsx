"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quiz } from "@shared/index";
import { adminGet, adminPost, adminPatch, adminDelete, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { deadlineToIso } from "@/lib/deadline";

/** Quiz management (PHASE 09C "Quiz Management"). */
export default function AdminQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [cloningId, setCloningId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setQuizzes(await adminGet<Quiz[]>("quizzes"));
    } catch {
      setError("Unable to load quizzes. Please try again.");
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
      await adminPost("quizzes", { subjectId, title, dueAt: deadlineToIso(dueAt) });
      setTitle("");
      setSubjectId("");
      setDueAt("");
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof AdminApiError ? err.message : "Unable to create the quiz. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish(quiz: Quiz) {
    await adminPatch(`quizzes/${quiz.id}`, { status: quiz.status === "published" ? "draft" : "published" });
    await load();
  }

  async function handleDelete(id: string) {
    await adminDelete(`quizzes/${id}`);
    await load();
  }

  async function handleClone(id: string) {
    setCloningId(id);
    try {
      await adminPost(`quizzes/${id}/clone`);
      await load();
    } finally {
      setCloningId(null);
    }
  }

  return (
    <section>
      <div className="admin-toolbar">
        <h1 className="page-heading" style={{ marginBottom: 0 }}>
          Quizzes
        </h1>
        <button type="button" className="btn" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Cancel" : "New Quiz"}
        </button>
      </div>

      {formOpen ? (
        <form className="admin-form" onSubmit={handleCreate} style={{ marginBottom: "var(--space-6)" }}>
          <div className="form-field">
            <label className="form-label" htmlFor="quiz-subject-id">
              Subject ID
            </label>
            <input id="quiz-subject-id" className="form-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="quiz-title">
              Title
            </label>
            <input id="quiz-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-field" dir="rtl"><label className="form-label" htmlFor="quiz-deadline">الموعد النهائي (اختياري)</label><input type="datetime-local" id="quiz-deadline" className="form-input" value={dueAt} onChange={event=>setDueAt(event.target.value)} /></div>
          {formError ? (
            <p role="alert" style={{ color: "var(--color-danger)" }}>
              {formError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Creating…" : "Create Quiz"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <ErrorState message={error} retryHref="/admin/quizzes" /> : null}
      {!error && quizzes === null ? <LoadingState label="Loading quizzes…" /> : null}
      {!error && quizzes && quizzes.length === 0 ? <EmptyState title="No quizzes yet" message="Create one above." /> : null}

      {!error && quizzes && quizzes.length > 0 ? (
        <>
          <div className="form-field" style={{ maxWidth: "20rem", marginBottom: "var(--space-3)" }}>
            <label className="form-label" htmlFor="quiz-filter">
              Filter by title
            </label>
            <input
              id="quiz-filter"
              className="form-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search quizzes…"
            />
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes
                  .filter((quiz) => quiz.title.toLowerCase().includes(filter.toLowerCase()))
                  .map((quiz) => (
                    <tr key={quiz.id}>
                      <td>
                        <Link href={`/admin/quizzes/${quiz.id}`}>{quiz.title}</Link>
                      </td>
                      <td>
                        <span className="badge">{quiz.status}</span>
                      </td>
                      <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        <button type="button" className="btn btn-secondary" onClick={() => togglePublish(quiz)}>
                          {quiz.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleClone(quiz.id)}
                          disabled={cloningId === quiz.id}
                        >
                          {cloningId === quiz.id ? "Cloning…" : "Clone"}
                        </button>
                        <ConfirmButton
                          label="Delete"
                          confirmTitle="Delete this quiz?"
                          confirmMessage={`"${quiz.title}" will be archived. Existing attempt history is preserved.`}
                          onConfirm={() => handleDelete(quiz.id)}
                        />
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
