/**
 * Storage abstraction (STORAGE_ARCHITECTURE.md). The backend is the only
 * thing that ever calls this — no client (web/mobile) holds credentials
 * for whichever concrete provider is behind it (PHASE 08 §3, §9).
 *
 * Two implementations exist: `SupabaseStorageProvider` (real, used when
 * live Supabase credentials are configured) and `LocalFilesystemStorageProvider`
 * (development/testing substitute, used automatically otherwise — see
 * `storageProviderFactory.ts`). Both implement the exact same contract, so
 * everything above this layer (validation, authorization, the files API)
 * behaves identically regardless of which one is active.
 */
export interface StorageProvider {
  readonly name: "supabase" | "local-filesystem";

  /** Uploads bytes to the given object key. Throws if the key already
   * exists (no silent overwrite — PHASE 08 §16's replace-not-overwrite
   * requirement is enforced by always generating a fresh key per file
   * version, never reusing one). */
  upload(objectKey: string, data: Buffer, contentType: string): Promise<void>;

  /** Generates a short-lived signed URL for reading the object. Must only
   * ever be called after the caller has already verified authorization —
   * this method itself performs no authorization check (that is
   * `FilesService`'s job, per PHASE 08 §11). */
  getSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string>;

  /** Best-effort object removal — used for upload-failure cleanup (PHASE 08
   * §10) and file deletion (PHASE 08 §17). Never throws if the object is
   * already absent. */
  delete(objectKey: string): Promise<void>;
}
