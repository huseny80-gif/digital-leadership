"use client";

import { use, useEffect, useState } from "react";
import type { Lecture, LectureItem, LectureItemType } from "@shared/index";
import { adminGet, adminPost, adminPatch, adminDelete, AdminApiError } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

const ITEM_TYPES: LectureItemType[] = ["pdf", "summary", "assignment", "exercise"];

/**
 * Lecture detail: edit the lecture, and manage its lecture items
 * (PHASE 09C "Lecture Items"). A `pdf` item's `fileId` must reference a
 * real, already-uploaded file — copy its ID from `/admin/files`; this
 * page does not re-implement upload (Phase 8's flow, linked to below).
 */
export default function AdminLectureDetailPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = use(params);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [items, setItems] = useState<LectureItem[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemType, setItemType] = useState<LectureItemType>("summary");
  const [itemTitle, setItemTitle] = useState("");
  const [itemBody, setItemBody] = useState("");
  const [itemFileId, setItemFileId] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);

  async function load() {
    setError(null);
    try {
      const [l, i] = await Promise.all([adminGet<Lecture>(`lectures/${lectureId}`), adminGet<LectureItem[]>(`lectures/${lectureId}/items`)]);
      setLecture(l);
      setItems(i);
      setTitle(l.title);
      setDescription(l.description ?? "");
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) setNotFound(true);
      else setError("Unable to load this lecture. Please try again.");
    }
  }

  useEffect(() => {
    // Fetch-on-mount for a client-rendered admin page: setState calls
    // happen only after the awaited request resolves, not synchronously
    // within the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await adminPatch<Lecture>(`lectures/${lectureId}`, { title, description: description || null });
      setLecture(updated);
    } catch (err) {
      setSaveError(err instanceof AdminApiError ? err.message : "Unable to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setCreatingItem(true);
    setItemError(null);
    try {
      await adminPost("lecture-items", {
        lectureId,
        itemType,
        title: itemTitle,
        bodyText: itemBody || null,
        fileId: itemType === "pdf" && itemFileId ? itemFileId : null,
      });
      setItemTitle("");
      setItemBody("");
      setItemFileId("");
      setItemFormOpen(false);
      await load();
    } catch (err) {
      setItemError(err instanceof AdminApiError ? err.message : "Unable to create the item. Please try again.");
    } finally {
      setCreatingItem(false);
    }
  }

  async function togglePublish(item: LectureItem) {
    await adminPatch(`lecture-items/${item.id}`, { status: item.status === "published" ? "draft" : "published" });
    await load();
  }

  async function handleDeleteItem(id: string) {
    await adminDelete(`lecture-items/${id}`);
    await load();
  }

  if (notFound) return <NotFoundState message="This lecture doesn't exist." />;
  if (error) return <ErrorState message={error} retryHref={`/admin/lectures/${lectureId}`} />;
  if (!lecture || !items) return <LoadingState label="Loading lecture…" />;

  return (
    <section>
      <Breadcrumbs items={[{ label: "Subjects", href: "/admin/subjects" }, { label: "Subject", href: `/admin/subjects/${lecture.subjectId}` }, { label: lecture.title }]} />
      <h1 className="page-heading">{lecture.title}</h1>

      <form className="admin-form" onSubmit={handleSave} style={{ marginBottom: "var(--space-6)" }}>
        <div className="form-field">
          <label className="form-label" htmlFor="lecture-edit-title">
            Title
          </label>
          <input id="lecture-edit-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="lecture-edit-description">
            Description
          </label>
          <textarea id="lecture-edit-description" className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
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
        <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>Lecture Items</h2>
        <button type="button" className="btn" onClick={() => setItemFormOpen((o) => !o)}>
          {itemFormOpen ? "Cancel" : "New Item"}
        </button>
      </div>

      {itemFormOpen ? (
        <form className="admin-form" onSubmit={handleCreateItem} style={{ marginBottom: "var(--space-5)" }}>
          <div className="form-field">
            <label className="form-label" htmlFor="item-type">
              Type
            </label>
            <select id="item-type" className="form-select" value={itemType} onChange={(e) => setItemType(e.target.value as LectureItemType)}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="item-title">
              Title
            </label>
            <input id="item-title" className="form-input" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} required />
          </div>
          {itemType !== "pdf" ? (
            <div className="form-field">
              <label className="form-label" htmlFor="item-body">
                Body text
              </label>
              <textarea id="item-body" className="form-textarea" value={itemBody} onChange={(e) => setItemBody(e.target.value)} />
            </div>
          ) : (
            <div className="form-field">
              <label className="form-label" htmlFor="item-file-id">
                File ID (from Admin → Files)
              </label>
              <input id="item-file-id" className="form-input" value={itemFileId} onChange={(e) => setItemFileId(e.target.value)} required />
            </div>
          )}
          {itemError ? (
            <p role="alert" style={{ color: "var(--color-danger)" }}>
              {itemError}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={creatingItem}>
              {creatingItem ? "Creating…" : "Create Item"}
            </button>
          </div>
        </form>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="No items yet" message="Create one above." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.itemType}</td>
                  <td>
                    <span className="badge">{item.status}</span>
                  </td>
                  <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-secondary" onClick={() => togglePublish(item)}>
                      {item.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <ConfirmButton
                      label="Delete"
                      confirmTitle="Delete this item?"
                      confirmMessage={`"${item.title}" will be archived and hidden from learners.`}
                      onConfirm={() => handleDeleteItem(item.id)}
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
