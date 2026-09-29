import { Pool } from "pg";
import { getEnv } from "../config/env.js";
import { HttpError } from "./httpError.js";

/**
 * Lazily-created connection pool to the application database (Phase 5
 * schema, applied via supabase/migrations/ — see DATABASE_IMPLEMENTATION.md).
 *
 * Per DATABASE_SECURITY.md §4/§7, the backend is the trusted, privileged
 * connection: it queries `public.users`/`public.roles` directly (there is
 * no `auth.uid()` here — that function exists only inside Supabase's own
 * Postgres, evaluated by RLS for a *direct* client connection, which this
 * is not). Nothing about this pool exposes credentials to any client —
 * `DATABASE_URL` lives only in backend/.env, never in web or mobile code
 * (SECURITY_ARCHITECTURE.md §10).
 */
let pool: Pool | null = null;

export class DatabaseNotConfiguredError extends HttpError {
  constructor() {
    super(
      500,
      "auth_not_configured",
      "Authentication is not fully configured on this server. See GOOGLE_OAUTH_SETUP.md.",
    );
  }
}

export function getPool(): Pool {
  const env = getEnv();
  if (!env.DATABASE_URL) {
    throw new DatabaseNotConfiguredError();
  }
  if (!pool) {
    pool = new Pool({ connectionString: env.DATABASE_URL });
  }
  return pool;
}
