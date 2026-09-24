"use client";

import { use, useEffect, useState } from "react";
import type { AdminQuestion } from "@shared/index";
import { adminGet, adminPatch, adminPost, adminDelete, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, ErrorState, NotFoundState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

/**
 * Question detail: edit prompt/points, and manage its options — the
 * answer key (PHASE 09C "Question Management" / "Assessment Security").
 * `isCorrect` is shown and toggleable here only; the learner-facing quiz
 * API never returns it (QUIZ_SECURITY.md, unchanged).
 */
export default function AdminQuestionDetailPage({ params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = use(params);
  const [question, setQuestion] = useState<AdminQuestion | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [optionText, setOptionText] = useState("");
  const [optionCorrect, setOptionCorrect] = useState(false);
  const [addingOption, setAddingOption] = useState(false);
  const [optionError, setOptionError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const q = await adminGet<AdminQuestion>(`questions/${questionId}`);
      setQuestion(q);
      setPrompt(q.prompt);
      setPoints(q.points);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) setNotFound(true);
      else setError("Unable to load this question. Please try again.");
    }
  }

  useEffect(() => {
    // Fetch-on-mount for a client-rendered admin page: setState calls
    // happen only after the awaited request resolves, not synchronously
    // within the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await adminPatch(`questions/${questionId}`, { prompt, points });
      await load();
    } catch (err) {
      setSaveError(err instanceof AdminApiError ? err.message : "Unable to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOption(e: React.FormEvent) {
    e.preventDefault();
    setAddingOption(true);
    setOptionError(null);
    try {
      await adminPost(`questions/${questionId}/options`, { optionText, isCorrect: optionCorrect, orderIndex: question?.options.length ?? 0 });
      setOptionText("");
      setOptionCorrect(false);
      await load();
    } catch (err) {
      setOptionError(err instanceof AdminApiError ? err.message : "Unable to add this option. Please try again.");
    } finally {
      setAddingOption(false);
    }
  }

  async function toggleCorrect(optionId: string, current: boolean) {
    await adminPatch(`questions/${questionId}/options/${optionId}`, { isCorrect: !current });
    await load();
  }

  async function handleDeleteOption(optionId: string) {
    await adminDelete(`questions/${questionId}/options/${optionId}`);
    await load();
  }

  if (notFound) return <NotFoundState message="This question doesn't exist." />;
  if (error) return <ErrorState message={error} retryHref={`/admin/questions/${questionId}`} />;
  if (!question) return <LoadingState label="Loading question…" />;

  return (
    <section>
      <Breadcrumbs items={[{ label: "Question Banks", href: "/admin/question-banks" }, { label: "Question" }]} />
      <h1 className="page-heading">Edit Question</h1>

      <form className="admin-form" onSubmit={handleSave} style={{ marginBottom: "var(--space-6)" }}>
        <div className="form-field">
          <label className="form-label" htmlFor="q-prompt">
            Prompt
          </label>
          <textarea id="q-prompt" className="form-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="q-points">
            Points
          </label>
          <input id="q-points" className="form-input" type="number" min={1} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
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

      <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginBottom: "var(--space-4)" }}>Options (answer key)</h2>

      {question.questionType === "short_answer" ? (
        <p className="item-row-meta" style={{ marginBottom: "var(--space-4)" }}>
          Short-answer questions have no options — there is no free-text answer key in the current schema (see
          ASSESSMENT_ARCHITECTURE.md).
        </p>
      ) : (
        <>
          <div className="admin-table-wrap" style={{ marginBottom: "var(--space-5)" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Text</th>
                  <th>Correct?</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {question.options.map((option) => (
                  <tr key={option.id}>
                    <td>{option.optionText}</td>
                    <td>
                      <label className="form-checkbox-row">
                        <input type="checkbox" checked={option.isCorrect} onChange={() => toggleCorrect(option.id, option.isCorrect)} />
                        <span className="badge">{option.isCorrect ? "Correct" : "Incorrect"}</span>
                      </label>
                    </td>
                    <td>
                      <ConfirmButton
                        label="Delete"
                        confirmTitle="Delete this option?"
                        confirmMessage="This is refused if a learner's recorded answer still references it."
                        onConfirm={() => handleDeleteOption(option.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="admin-form" onSubmit={handleAddOption}>
            <div className="form-field">
              <label className="form-label" htmlFor="option-text">
                New option text
              </label>
              <input id="option-text" className="form-input" value={optionText} onChange={(e) => setOptionText(e.target.value)} required />
            </div>
            <label className="form-checkbox-row">
              <input type="checkbox" checked={optionCorrect} onChange={(e) => setOptionCorrect(e.target.checked)} />
              <span className="form-label" style={{ fontWeight: 500 }}>
                This is the correct answer
              </span>
            </label>
            {optionError ? (
              <p role="alert" style={{ color: "var(--color-danger)" }}>
                {optionError}
              </p>
            ) : null}
            <div className="form-actions">
              <button type="submit" className="btn" disabled={addingOption}>
                {addingOption ? "Adding…" : "Add Option"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
