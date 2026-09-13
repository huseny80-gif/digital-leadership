import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { StorageProvider } from "./storageProvider.js";
import { createLocalSignedToken } from "./localSignedUrlToken.js";
import { HttpError } from "../lib/httpError.js";

/**
 * Development/testing substitute for Supabase Storage, used automatically
 * when live Supabase credentials are not configured (see
 * `storageProviderFactory.ts`). This exists because no live Supabase
 * project was available in this environment (`STORAGE_IMPLEMENTATION.md`
 * "Live Supabase Verification Status") — it lets the entire upload ->
 * authorize -> signed-URL -> access flow be exercised for real, against
 * a real filesystem and a real HMAC-verified, expiring URL, rather than
 * mocked. It is NOT a production storage backend (no redundancy, no
 * access logging beyond this app's own audit log, single-machine only)
 * and is never selected when Supabase credentials are present.
 */
export class LocalFilesystemStorageProvider implements StorageProvider {
  readonly name = "local-filesystem" as const;

  constructor(
    private readonly rootDir: string,
    private readonly apiBaseUrl: string,
  ) {}

  private resolvePath(objectKey: string): string {
    // Defense-in-depth against path traversal even though objectKey is
    // always server-generated (never derived from a client-supplied path)
    // — see backend/src/files/objectPath.ts.
    const resolved = normalize(join(this.rootDir, objectKey));
    if (!resolved.startsWith(normalize(this.rootDir) + sep) && resolved !== normalize(this.rootDir)) {
      throw new HttpError(400, "validation_error", "Invalid storage object key.");
    }
    return resolved;
  }

  async upload(objectKey: string, data: Buffer, _contentType: string): Promise<void> {
    const path = this.resolvePath(objectKey);
    const exists = await stat(path).then(
      () => true,
      () => false,
    );
    if (exists) {
      throw new HttpError(409, "conflict", "An object already exists at this storage key.");
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async getSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    const { token, expires } = createLocalSignedToken(objectKey, expiresInSeconds);
    const url = new URL(`${this.apiBaseUrl}/api/v1/files/local-object/${encodeURIComponent(objectKey)}`);
    url.searchParams.set("token", token);
    url.searchParams.set("expires", String(expires));
    return url.toString();
  }

  async delete(objectKey: string): Promise<void> {
    const path = this.resolvePath(objectKey);
    await rm(path, { force: true });
  }

  /** Used only by the local-object serving route — never by application
   * business logic, which only ever goes through `getSignedUrl`. */
  async read(objectKey: string): Promise<Buffer> {
    return readFile(this.resolvePath(objectKey));
  }
}
