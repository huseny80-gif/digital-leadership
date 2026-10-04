"use client";

import { useEffect, useState } from "react";
import type { FileMetadata, SignedFileUrl } from "@shared/index";
import { adminGet } from "@/lib/api/adminBrowserClient";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SmartContentUpload } from "@/components/admin/SmartContentUpload";

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Lists files via the admin proxy. SmartContentUpload automatically
 * assigns uploaded PDFs to their course and lecture and updates quizzes;
 * deletion reuses the per-file proxy's DELETE.
 * No storage credential, signed URL, or Supabase Storage call ever
 * reaches this page — every operation is backend-mediated.
 */
export default function AdminFilesPage() {
  const [files, setFiles] = useState<FileMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    const refresh = () => { void load(); };
    window.addEventListener("content-import-completed", refresh);
    return () => window.removeEventListener("content-import-completed", refresh);
  }, []);

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
      <h1 className="page-heading">المحاضرات والملفات الدراسية</h1>
      <p className="page-subheading">تُحفظ الملفات تلقائيًا في مادتها ومحاضرتها، وتُحدَّث اختبارات المادة عند اكتمال قراءتها.</p>

      <SmartContentUpload />

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
