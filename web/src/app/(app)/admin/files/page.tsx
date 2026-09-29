"use client";

import { useEffect, useState } from "react";
import type { FileMetadata, SignedFileUrl } from "@shared/index";
import { adminGet } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * File management (PHASE 09C "File Management"). Lists files via the
 * admin proxy; upload goes through `/api/admin/upload-file` (a
 * multipart-forwarding proxy to the unmodified Phase 8
 * `POST /api/v1/files`); deletion reuses the per-file proxy's `DELETE`.
 * No storage credential, signed URL, or Supabase Storage call ever
 * reaches this page — every operation is backend-mediated.
 */
export default function AdminFilesPage() {
  const [files, setFiles] = useState<FileMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [lectureId, setLectureId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await adminGet<FileMetadata[]>("files");
      setFiles(data);
    } catch {
      setError("Unable to load files. Please try again.");
    }
  }

  useEffect(() => {
    // Fetch-on-mount for a client-rendered admin page: setState calls
    // happen only after the awaited request resolves, not synchronously
    // within the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Choose a PDF file to upload.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.set("subjectId", subjectId);
      if (lectureId) formData.set("lectureId", lectureId);
      formData.set("file", selectedFile);

      const res = await fetch("/api/admin/upload-file", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setUploadError(body.error?.message ?? "Unable to upload this file. Please try again.");
        return;
      }
      setSelectedFile(null);
      setSubjectId("");
      setLectureId("");
      await load();
    } catch {
      setUploadError("Unable to upload this file. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // Opens a file via the backend-mediated signed-URL flow — the bucket
  // stays private; this page only ever handles the short-lived URL the
  // proxy returns, never a storage path or credential.
  async function handleOpen(id: string) {
    setOpenError(null);
    setOpeningFileId(id);
    try {
      const res = await fetch(`/api/files/${id}`);
      const body = await res.json();
      if (!res.ok) {
        setOpenError(body.error?.message ?? "Unable to open this file. Please try again.");
        return;
      }
      const data = body.data as SignedFileUrl;
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setOpenError("Unable to open this file. Please try again.");
    } finally {
      setOpeningFileId(null);
    }
  }

  // Deletion uses the dedicated `/api/files/:fileId` proxy (added in
  // Phase 09C alongside its existing GET handler) rather than the
  // `/api/admin/*` catch-all, since that per-file route is where the
  // rest of this app's file operations already live (PDF viewing).
  async function handleDelete(id: string) {
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error?.message ?? "Unable to delete this file.");
    }
  }

  return (
    <section>
      <h1 className="page-heading">Files</h1>
      <p className="page-subheading">
        PDFs uploaded to the platform. Upload validates MIME type, extension, magic bytes, and size, then stores the file
        privately (Phase 8, unmodified) — copy a file&apos;s ID to attach it to a lecture item.
      </p>

      <form className="admin-form" onSubmit={handleUpload} style={{ marginBottom: "var(--space-6)" }}>
        <div className="form-field">
          <label className="form-label" htmlFor="upload-subject-id">
            Subject ID
          </label>
          <input id="upload-subject-id" className="form-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="upload-lecture-id">
            Lecture ID (optional)
          </label>
          <input id="upload-lecture-id" className="form-input" value={lectureId} onChange={(e) => setLectureId(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="upload-file">
            PDF file
          </label>
          <input
            id="upload-file"
            className="form-input"
            type="file"
            accept="application/pdf"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>
        {uploadError ? (
          <p role="alert" style={{ color: "var(--color-danger)" }}>
            {uploadError}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="btn" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload PDF"}
          </button>
        </div>
      </form>

      {openError ? (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {openError}
        </p>
      ) : null}

      {error ? <ErrorState message={error} retryHref="/admin/files" /> : null}
      {!error && files === null ? <LoadingState label="Loading files…" /> : null}
      {!error && files && files.length === 0 ? <EmptyState title="No files yet" message="Upload one above." /> : null}

      {!error && files && files.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Status</th>
                <th>ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>{file.originalFilename}</td>
                  <td>{formatSize(file.sizeBytes)}</td>
                  <td>
                    <span className="badge">{file.status}</span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "var(--font-size-sm)" }}>{file.id}</td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      disabled={openingFileId === file.id}
                      onClick={() => handleOpen(file.id)}
                      style={{ marginRight: "var(--space-2)" }}
                    >
                      {openingFileId === file.id ? "Opening…" : "Open"}
                    </button>
                    <ConfirmButton
                      label="Delete"
                      confirmTitle="Delete this file?"
                      confirmMessage={`"${file.originalFilename}" will be permanently removed. This is refused if a lecture item still references it.`}
                      onConfirm={async () => {
                        await handleDelete(file.id);
                        await load();
                      }}
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
