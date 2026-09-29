import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./storageProvider.js";
import { HttpError } from "../lib/httpError.js";

/**
 * Real Supabase Storage implementation (STORAGE_ARCHITECTURE.md §"Bucket").
 *
 * Uses the service-role key — this is the one legitimate place in the
 * whole codebase that key is read, and it is read only from
 * `backend/.env` (server-only, never committed, never sent to any
 * client — SECURITY_ARCHITECTURE.md §10). The bucket itself MUST be
 * private; this class never calls any API that would create or rely on a
 * public URL.
 *
 * NOT VERIFIED AGAINST A LIVE PROJECT in this environment — no Supabase
 * credentials were available (STORAGE_IMPLEMENTATION.md "Live Supabase
 * Verification Status"). This is real, complete client code, not a stub,
 * but its correctness against Supabase's actual Storage API has not been
 * exercised end-to-end.
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(
    private readonly bucket: string,
    supabaseUrl: string,
    serviceRoleKey: string,
  ) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async upload(objectKey: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(objectKey, data, {
      contentType,
      upsert: false, // never overwrite — PHASE 08 §16
    });
    if (error) {
      throw new HttpError(500, "storage_error", "Failed to store the uploaded file.");
    }
  }

  async getSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(objectKey, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new HttpError(500, "storage_error", "Failed to generate file access URL.");
    }
    return data.signedUrl;
  }

  async delete(objectKey: string): Promise<void> {
    // Best-effort: Supabase's remove() does not error on a missing key,
    // matching the interface's "never throws if already absent" contract.
    await this.client.storage.from(this.bucket).remove([objectKey]);
  }
}
