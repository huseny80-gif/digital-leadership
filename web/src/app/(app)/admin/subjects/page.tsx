"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Subject } from "@shared/index";
import { adminGet, adminPost, adminPatch, adminDelete, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

/**
 * Subject management (PHASE 09C "Subject Management"). List, create,
 * publish/unpublish, and soft-delete — every action calls the admin BFF
 * proxy, which the backend independently authorizes and validates.
 */
export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await adminGet<Subject[]>("subjects");
      setSubjects(data);
    } catch {
      setError("Unable to load subjects. Please try again.");
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
      await adminPost("subjects", { title, description: description || null });
      setTitle("");
      setDescription("");
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof AdminApiError ? err.message : "Unable to create the subject. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish(subject: Subject) {
    await adminPatch(`subjects/${subject.id}`, { status: subject.status === "published" ? "draft" : "published" });
    await load();
  }

  async function handleDelete(id: string) {
    await adminDelete(`subjects/${id}`);
    await load();
  }

  return (
    <section>
      <div className="admin-toolbar">
        <h1 className="page-heading" style={{ marginBottom: 0 }}>
          Subjects
        </h1>
        <button type="button" className="btn" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Cancel" : "New Subject"}
        </button>
      </div>

      {formOpen ? (
        <form className="admin-form" onSubmit={handleCreate} style={{ marginBottom: "var(--space-6)" }}>
          <div className="form-field">
            <label className="form-label" htmlFor="subject-title">
              Title
            </label>
            <input id="subject-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="subject-description">
              Description
            </label>
            <textarea id="subject-description" className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {formError ? (
            <p role="alert" style={{ color: "var(--color-danger)" }}>
              {formError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Creating…" : "Create Subject"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <ErrorState message={error} retryHref="/admin/subjects" /> : null}
      {!error && subjects === null ? <LoadingState label="Loading subjects…" /> : null}
      {!error && subjects && subjects.length === 0 ? <EmptyState title="No subjects yet" message="Create your first subject above." /> : null}

      {!error && subjects && subjects.length > 0 ? (
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
              {subjects.map((subject) => (
                <tr key={subject.id}>
                  <td>
                    <Link href={`/admin/subjects/${subject.id}`}>{subject.title}</Link>
                  </td>
                  <td>
                    <span className="badge">{subject.status}</span>
                  </td>
                  <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-secondary" onClick={() => togglePublish(subject)}>
                      {subject.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <ConfirmButton
                      label="Delete"
                      confirmTitle="Delete this subject?"
                      confirmMessage={`"${subject.title}" will be archived and hidden from learners. This does not delete its lectures.`}
                      onConfirm={() => handleDelete(subject.id)}
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
