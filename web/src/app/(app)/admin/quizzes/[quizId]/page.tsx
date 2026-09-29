"use client";

import { use, useEffect, useState } from "react";
import type { AdminQuizQuestionLink, Quiz } from "@shared/index";
import { adminGet, adminPatch, adminPost, adminDelete, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

/** Quiz detail: edit fields, and manage which questions belong to it
 * (PHASE 09C "Quiz Management"). Question order is set by the order in
 * which they were added / the `orderIndex` supplied — matching the
 * existing `quiz_questions.order_index` column, no new ordering field. */
export default function AdminQuizDetailPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [links, setLinks] = useState<AdminQuizQuestionLink[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [questionId, setQuestionId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [q, l] = await Promise.all([adminGet<Quiz>(`quizzes/${quizId}`), adminGet<AdminQuizQuestionLink[]>(`quizzes/${quizId}/questions`)]);
      setQuiz(q);
      setLinks(l);
      setTitle(q.title);
      setDescription(q.description ?? "");
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) setNotFound(true);
      else setError("Unable to load this quiz. Please try again.");
    }
  }

  useEffect(() => {
    // Fetch-on-mount for a client-rendered admin page: setState calls
    // happen only after the awaited request resolves, not synchronously
    // within the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await adminPatch(`quizzes/${quizId}`, { title, description: description || null });
      await load();
    } catch (err) {
      setSaveError(err instanceof AdminApiError ? err.message : "Unable to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      await adminPost(`quizzes/${quizId}/questions`, { questionId, orderIndex: links?.length ?? 0 });
      setQuestionId("");
      await load();
    } catch (err) {
      setAddError(err instanceof AdminApiError ? err.message : "Unable to add this question. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveQuestion(qId: string) {
    await adminDelete(`quizzes/${quizId}/questions/${qId}`);
    await load();
  }

  if (notFound) return <NotFoundState message="This quiz doesn't exist." />;
  if (error) return <ErrorState message={error} retryHref={`/admin/quizzes/${quizId}`} />;
  if (!quiz || !links) return <LoadingState label="Loading quiz…" />;

  return (
    <section>
      <Breadcrumbs items={[{ label: "Quizzes", href: "/admin/quizzes" }, { label: quiz.title }]} />
      <h1 className="page-heading">{quiz.title}</h1>

      <form className="admin-form" onSubmit={handleSave} style={{ marginBottom: "var(--space-6)" }}>
        <div className="form-field">
          <label className="form-label" htmlFor="quiz-edit-title">
            Title
          </label>
          <input id="quiz-edit-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="quiz-edit-description">
            Description
          </label>
          <textarea id="quiz-edit-description" className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {saveError ? (
          <p role="alert" style={{ color: "var(--color-danger)" }}>
            {saveError}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>

      <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginBottom: "var(--space-4)" }}>Questions</h2>

      {links.length === 0 ? (
        <EmptyState title="No questions yet" message="Add one below by its question ID (see Question Banks)." />
      ) : (
        <div className="admin-table-wrap" style={{ marginBottom: "var(--space-5)" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Prompt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.questionId}>
                  <td>{link.orderIndex}</td>
                  <td>{link.question.prompt}</td>
                  <td>
                    <ConfirmButton
                      label="Remove"
                      confirmTitle="Remove this question from the quiz?"
                      confirmMessage="This only unlinks the question from this quiz — it is not deleted."
                      onConfirm={() => handleRemoveQuestion(link.questionId)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="admin-form" onSubmit={handleAddQuestion}>
        <div className="form-field">
          <label className="form-label" htmlFor="add-question-id">
            Question ID (from Question Banks)
          </label>
          <input id="add-question-id" className="form-input" value={questionId} onChange={(e) => setQuestionId(e.target.value)} required />
        </div>
        {addError ? (
          <p role="alert" style={{ color: "var(--color-danger)" }}>
            {addError}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="btn" disabled={adding}>
            {adding ? "Adding…" : "Add Question"}
          </button>
        </div>
      </form>
    </section>
  );
}
