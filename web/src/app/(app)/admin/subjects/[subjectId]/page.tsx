"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { Lecture, Subject } from "@shared/index";
import { adminGet, adminPost, adminPatch, adminDelete, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

/** Subject detail: edit its own fields, and manage its lectures
 * (PHASE 09C "Lecture Management" — subjectId is always re-validated
 * server-side when creating a lecture, never trusted from the URL alone). */
export default function AdminSubjectDetailPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [lectureFormOpen, setLectureFormOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureError, setLectureError] = useState<string | null>(null);
  const [creatingLecture, setCreatingLecture] = useState(false);

  async function load() {
    setError(null);
    try {
      const [s, l] = await Promise.all([adminGet<Subject>(`subjects/${subjectId}`), adminGet<Lecture[]>(`subjects/${subjectId}/lectures`)]);
      setSubject(s);
      setLectures(l);
      setTitle(s.title);
      setDescription(s.description ?? "");
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) setNotFound(true);
      else setError("Unable to load this subject. Please try again.");
    }
  }

  useEffect(() => {
    // Fetch-on-mount for a client-rendered admin page: setState calls
    // happen only after the awaited request resolves, not synchronously
    // within the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await adminPatch<Subject>(`subjects/${subjectId}`, { title, description: description || null });
      setSubject(updated);
    } catch (err) {
      setSaveError(err instanceof AdminApiError ? err.message : "Unable to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLecture(e: React.FormEvent) {
    e.preventDefault();
    setCreatingLecture(true);
    setLectureError(null);
    try {
      await adminPost("lectures", { subjectId, title: lectureTitle });
      setLectureTitle("");
      setLectureFormOpen(false);
      await load();
    } catch (err) {
      setLectureError(err instanceof AdminApiError ? err.message : "Unable to create the lecture. Please try again.");
    } finally {
      setCreatingLecture(false);
    }
  }

  async function togglePublish(lecture: Lecture) {
    await adminPatch(`lectures/${lecture.id}`, { status: lecture.status === "published" ? "draft" : "published" });
    await load();
  }

  async function handleDeleteLecture(id: string) {
    await adminDelete(`lectures/${id}`);
    await load();
  }

  if (notFound) return <NotFoundState message="This subject doesn't exist." />;
  if (error) return <ErrorState message={error} retryHref={`/admin/subjects/${subjectId}`} />;
  if (!subject || !lectures) return <LoadingState label="Loading subject…" />;

  return (
    <section>
      <Breadcrumbs items={[{ label: "Subjects", href: "/admin/subjects" }, { label: subject.title }]} />
      <h1 className="page-heading">{subject.title}</h1>

      <form className="admin-form" onSubmit={handleSave} style={{ marginBottom: "var(--space-6)" }}>
        <div className="form-field">
          <label className="form-label" htmlFor="edit-title">
            Title
          </label>
          <input id="edit-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="edit-description">
            Description
          </label>
          <textarea id="edit-description" className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
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

      <div className="admin-toolbar">
        <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>Lectures</h2>
        <button type="button" className="btn" onClick={() => setLectureFormOpen((o) => !o)}>
          {lectureFormOpen ? "Cancel" : "New Lecture"}
        </button>
      </div>

      {lectureFormOpen ? (
        <form className="admin-form" onSubmit={handleCreateLecture} style={{ marginBottom: "var(--space-5)" }}>
          <div className="form-field">
            <label className="form-label" htmlFor="lecture-title">
              Title
            </label>
            <input id="lecture-title" className="form-input" value={lectureTitle} onChange={(e) => setLectureTitle(e.target.value)} required />
          </div>
          {lectureError ? (
            <p role="alert" style={{ color: "var(--color-danger)" }}>
              {lectureError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={creatingLecture}>
              {creatingLecture ? "Creating…" : "Create Lecture"}
            </button>
          </div>
        </form>
      ) : null}

      {lectures.length === 0 ? (
        <EmptyState title="No lectures yet" message="Create one above." />
      ) : (
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
              {lectures.map((lecture) => (
                <tr key={lecture.id}>
                  <td>
                    <Link href={`/admin/lectures/${lecture.id}`}>{lecture.title}</Link>
                  </td>
                  <td>
                    <span className="badge">{lecture.status}</span>
                  </td>
                  <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-secondary" onClick={() => togglePublish(lecture)}>
                      {lecture.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <ConfirmButton
                      label="Delete"
                      confirmTitle="Delete this lecture?"
                      confirmMessage={`"${lecture.title}" will be archived and hidden from learners.`}
                      onConfirm={() => handleDeleteLecture(lecture.id)}
                    />
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
