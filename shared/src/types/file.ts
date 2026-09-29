/**
 * Mirrors `files` in DATABASE_DESIGN.md §5. `storageKey` deliberately does
 * NOT appear here — per DATABASE_SECURITY.md §6, the raw storage key is
 * never returned to a client; only the backend resolves it into a
 * short-lived signed URL (see `SignedFileUrl` below).
 */
export interface FileMetadata {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: "active" | "archived";
  uploadedBy: string;
  createdAt: string;
}

/**
 * The response shape for a request to access a private file
 * (ARCHITECTURE_DIAGRAM.md §7, Secure PDF Access Flow). `url` is
 * short-lived and single-purpose; `expiresAt` lets the client know when it
 * must re-request access rather than assuming the link is durable.
 */
export interface SignedFileUrl {
  url: string;
  expiresAt: string;
}
