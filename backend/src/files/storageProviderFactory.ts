import { getEnv } from "../config/env.js";
import type { StorageProvider } from "./storageProvider.js";
import { SupabaseStorageProvider } from "./supabaseStorageProvider.js";
import { LocalFilesystemStorageProvider } from "./localStorageProvider.js";

let cached: StorageProvider | null = null;

/**
 * Chooses the storage backend (STORAGE_ARCHITECTURE.md §"Provider
 * Selection"): Supabase Storage when live credentials are configured,
 * otherwise the local-filesystem substitute. This choice is made once,
 * automatically, from environment configuration — application code never
 * branches on which provider is active.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const env = getEnv();

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    cached = new SupabaseStorageProvider(env.SUPABASE_STORAGE_BUCKET, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    const apiBaseUrl = `http://localhost:${env.PORT}`;
    cached = new LocalFilesystemStorageProvider(env.LOCAL_STORAGE_DIR, apiBaseUrl);
  }
  return cached;
}

/** Test-only: forces re-selection on the next call (e.g. after stubbing
 * environment variables in a test). */
export function resetStorageProviderForTests(): void {
  cached = null;
}
