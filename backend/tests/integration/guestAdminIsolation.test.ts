import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";

/**
 * Phase 6 final-gate requirement: prove, against a REAL admin endpoint
 * (not a mocked/isolated middleware unit test), that a guest training
 * session can never reach an Admin Console API.
 *
 * `admin.use(requireAdmin)` in `trainingAccessRoutes.ts` gates every
 * `/api/v1/admin/training-access/*` route exactly like every other admin
 * route in the app (`admin/adminRoutes.ts`) — `requireAdmin` rejects on
 * `!req.user`, and a guest session cookie NEVER populates `req.user`
 * (only `authenticate`, driven by a Supabase bearer token, does that;
 * `resolveGuestSession`/`requireGuestSession` only ever set
 * `req.guestSession`, and are wired only onto `/training-access/join`
 * and `/guest/*`, never onto the `/admin/*` sub-router). So this request
 * is rejected at the authorization gate before any database query runs
 * — no live Postgres is required for this test, unlike the DB-backed
 * suites elsewhere in this file's sibling tests.
 */
describe("guest session cannot reach admin endpoints (Phase 6 final gate)", () => {
  it("a genuinely-signed guest session cookie, with no Authorization header, gets 401 from a real admin training-access endpoint", async () => {
    const app = createApp();
    // A real, correctly-signed guest session cookie — not a forged one.
    // The point is that even a *valid* guest session must never reach
    // an admin route, not merely that a forged one is rejected (that's
    // covered separately by guestSessionCookie.test.ts case #13).
    const cookie = signGuestSessionCookieValue("11111111-1111-1111-1111-111111111111");

    const res = await request(app)
      .get("/api/v1/admin/training-access")
      .set("Cookie", `training_guest_session=${cookie}`);

    expect(res.status).toBe(401);
  });

  it("same guest cookie is also rejected by the admin-only guest-analytics endpoint", async () => {
    const app = createApp();
    const cookie = signGuestSessionCookieValue("11111111-1111-1111-1111-111111111111");

    const res = await request(app)
      .get("/api/v1/admin/training-access/guests")
      .set("Cookie", `training_guest_session=${cookie}`);

    expect(res.status).toBe(401);
  });
});
