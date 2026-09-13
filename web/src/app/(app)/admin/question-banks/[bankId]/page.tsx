"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { AdminQuestion, QuestionBank, QuestionType } from "@shared/index";
import { adminGet, adminPost, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

const QUESTION_TYPES: QuestionType[] = ["multiple_choice", "true_false", "short_answer"];

/** Question bank detail: create/list questions within it
 * (PHASE 09C "Question Management"). Option management (including the
 * answer key) lives on each question's own detail page. */
export default function AdminQuestionBankDetailPage({ params }: { params: Promise<{ bankId: string }> }) {
  const { bankId } = use(params);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [questionType, setQuestionType] = useState<QuestionType>("multiple_choice");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [b, q] = await Promise.all([
        adminGet<QuestionBank>(`question-banks/${bankId}`),
        adminGet<AdminQuestion[]>(`question-banks/${bankId}/questions`),
      ]);
      setBank(b);
      setQuestions(q);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) setNotFound(true);
      else setError("Unable to load this question bank. Please try again.");
    }
  }

  useEffect(() => {
    // Fetch-on-mount for a client-rendered admin page: setState calls
    // happen only after the awaited request resolves, not synchronously
    // within the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminPost("questions", { questionBankId: bankId, questionType, prompt, points });
      setPrompt("");
      setPoints(1);
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof AdminApiError ? err.message : "Unable to create the question. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) return <NotFoundState message="This question bank doesn't exist." />;
  if (error) return <ErrorState message={error} retryHref={`/admin/question-banks/${bankId}`} />;
  if (!bank || !questions) return <LoadingState label="Loading question bank…" />;

  return (
    <section>
      <Breadcrumbs items={[{ label: "Question Banks", href: "/admin/question-banks" }, { label: bank.title }]} />
      <h1 className="page-heading">{bank.title}</h1>

      <div className="admin-toolbar">
        <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>Questions</h2>
        <button type="button" className="btn" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Cancel" : "New Question"}
        </button>
      </div>

      {formOpen ? (
        <form className="admin-form" onSubmit={handleCreate} style={{ marginBottom: "var(--space-5)" }}>
          <div className="form-field">
            <label className="form-label" htmlFor="question-type">
              Type
            </label>
            <select id="question-type" className="form-select" value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType)}>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="question-prompt">
              Prompt
            </label>
            <textarea id="question-prompt" className="form-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="question-points">
              Points
            </label>
            <input
              id="question-points"
              className="form-input"
              type="number"
              min={1}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </div>
          {formError ? (
            <p role="alert" style={{ color: "var(--color-danger)" }}>
              {formError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Creating…" : "Create Question"}
            </button>
          </div>
          {questionType !== "short_answer" ? (
            <p className="item-row-meta">After creating this question, open it to add answer options.</p>
          ) : (
            <p className="item-row-meta">Short-answer questions are recorded but not auto-graded (no free-text answer key in the schema).</p>
          )}
        </form>
      ) : null}

      {questions.length === 0 ? (
        <EmptyState title="No questions yet" message="Create one above." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Prompt</th>
                <th>Type</th>
                <th>Options</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id}>
                  <td>{q.prompt}</td>
                  <td>{q.questionType}</td>
                  <td>{q.options.length}</td>
                  <td>
                    <Link href={`/admin/questions/${q.id}`} className="btn btn-secondary">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
