/**
 * Supabase auth wiring.
 *
 * Session storage policy: tokens live in `sessionStorage` (cleared when the
 * tab closes) rather than `localStorage`, shrinking the window in which a
 * stolen device or an XSS foothold can reuse a refresh token. Field tablets
 * that must stay signed in across restarts can opt into `persistent: true`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory fallback used when Web Storage is unavailable (private mode, SSR, tests). */
export function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export function pickStorage(persistent: boolean, w: { sessionStorage?: Storage; localStorage?: Storage } | undefined = globalThis as never): StorageLike {
  try {
    const s = persistent ? w?.localStorage : w?.sessionStorage;
    if (!s) return memoryStorage();
    const probe = "__seismic_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStorage();
  }
}

export interface AuthConfig {
  url: string | undefined;
  anonKey: string | undefined;
  persistent?: boolean;
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export function createSeismicSupabase(cfg: AuthConfig, factory: typeof createClient = createClient): SupabaseClient {
  if (!cfg.url || !/^https:\/\//.test(cfg.url)) throw new AuthConfigError("VITE_SUPABASE_URL must be an https:// URL");
  if (!cfg.anonKey) throw new AuthConfigError("VITE_SUPABASE_ANON_KEY is missing");
  return factory(cfg.url, cfg.anonKey, {
    auth: {
      storage: pickStorage(cfg.persistent ?? false),
      storageKey: "seismic.auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}

export type Role = "crew_manager" | "party_chief" | "observer" | "surveyor" | "mechanic" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  viewer: 0, mechanic: 1, surveyor: 1, observer: 2, party_chief: 3, crew_manager: 4,
};

/** Reads the role from app_metadata (server-controlled), never user_metadata. */
export function roleFromAppMetadata(meta: Record<string, unknown> | undefined): Role {
  const r = meta?.["seismic_role"];
  return typeof r === "string" && r in ROLE_RANK ? (r as Role) : "viewer";
}

export function canControlSimulation(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.observer;
}
