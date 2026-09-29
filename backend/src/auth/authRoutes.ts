import { Router } from "express";
import type { ApiResult, UserProfile } from "@shared/index";
import { requireAuthenticated } from "../middleware/authInstance.js";
import { getPool } from "../lib/db.js";

/**
 * Authentication endpoints.
 *
 * There is no `/auth/google/callback` endpoint here — Google OAuth itself
 * is handled entirely by Supabase Auth (the web client calls Supabase
 * directly; see AUTHENTICATION.md and GOOGLE_OAUTH_SETUP.md). This
 * backend's only job in the auth flow is to verify the resulting
 * Supabase-issued access token and resolve/provision the corresponding
 * application user — which happens in the `authenticate` middleware and
 * is confirmed to the client via `POST /session` below.
 */
export function authRoutes(): Router {
  const router = Router();

  // `authenticate` (not `requireAuthenticated`) runs globally on every
  // request already (see app.ts) — these routes additionally require it
  // explicitly so a request with no/invalid token is rejected here too,
  // not just silently proceed with `req.user` undefined.
  router.post("/session", requireAuthenticated, (req, res) => {
    const body: ApiResult<UserProfile> = { data: req.user! };
    res.json(body);
  });

  router.post("/logout", async (req, res, next) => {
    try {
      // Supabase owns the session/refresh token; actually revoking it is
      // done client-side via the Supabase SDK's signOut() call
      // (SESSION_SECURITY.md — session lifecycle). This endpoint's
      // job is limited to recording the event for audit purposes when we
      // know who logged out; it is a no-op (200) for an already-anonymous
      // caller, since there is nothing to invalidate server-side.
      if (req.user) {
        await getPool().query(
          `insert into audit_logs (actor_user_id, action, entity_type, entity_id)
           values ($1, 'user.logout', 'user', $1)`,
          [req.user.id],
        );
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
