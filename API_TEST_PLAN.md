# API Test Plan

Status: Phase 7. Documents the test scenarios required by this phase, which were run, and their results — extending `AUTHENTICATION_TEST_PLAN.md` (Phase 6) rather than replacing it.

## Test Environment

Same local PostgreSQL database strategy as Phase 5/6 (`digital_leadership_backend_test`, seeded with the unmodified Phase 5 migrations — see `AUTHENTICATION_TEST_PLAN.md` "Local Test Database" for how to recreate it). `backend/tests/integration/content.test.ts` adds fixture helpers (`backend/tests/helpers/seedFixtures.ts`) to create subjects/lectures/lecture items/files/question banks directly via SQL, since the admin write endpoints that would normally create this data are still `501 not_implemented` (Phase 7 didn't build them — see `API_V1.md`).

Vitest now runs test files sequentially (`fileParallelism: false` in `backend/vitest.config.ts`) rather than in parallel, since integration test files share one database and truncate overlapping tables between tests — this was a necessary, deliberate change to keep the suite deterministic as it grew, not an accidental side effect.

## Results Summary

**58 of 58 backend tests pass** (7 test files) — `23` of them new in this phase (`content.test.ts`), the rest (`35`) carried over unchanged from Phase 6 and still passing. **16 of 16 web tests pass** (no web test needed changes — Phase 7 built no web-facing code). Full commands:

```
cd backend && npm test    # 58 passed (7 test files)
cd web && npm test        # 16 passed (3 test files)
```

## Scenario-by-Scenario Results

### Authentication (carried over from Phase 6, still passing, listed for completeness)

| # | Scenario | Result |
|---|---|---|
| 1 | Anonymous `GET /api/v1/me` → 401 | ✅ (Phase 6 `auth.test.ts`) |
| 2 | Authenticated user `GET /api/v1/me` → 200 | ✅ (Phase 6 `auth.test.ts`, plus this phase confirms the same via `content.test.ts` "26") |
| 3 | User cannot impersonate another user | ✅ (Phase 6 `auth.test.ts` "forged identity") |

### Subjects

| # | Scenario | Test | Result |
|---|---|---|---|
| 4 | Anonymous `GET /subjects` → 401 | `content.test.ts` "Subjects > 4" | ✅ |
| 5 | Authenticated user `GET /subjects` → 200 | "Subjects > 5" (also confirms only published + pagination envelope shape) | ✅ |
| 6 | Invalid subject ID → 400 | "Subjects > 6" | ✅ |
| 7 | Nonexistent subject → 404 | "Subjects > 7" | ✅ |
| 8 | Unpublished subject not exposed to normal user | "Subjects > 8" (also confirms an admin *does* see it) | ✅ |

Additional, beyond the required list: a normal user's subject list never contains a draft subject even when requesting the maximum page size (`limit=100`).

### Lectures

| # | Scenario | Test | Result |
|---|---|---|---|
| 9 | Anonymous `GET` lecture → 401 | "Lectures > 9" | ✅ |
| 10 | Authenticated user `GET` published lecture → 200 | "Lectures > 10" | ✅ |
| 11 | Invalid lecture ID → 400 | "Lectures > 11" | ✅ |
| 12 | Nonexistent lecture → 404 | "Lectures > 12" | ✅ |
| 13 | Unauthorized/unpublished lecture denied | "Lectures > 13a/13b/13c" — three variants: a directly-draft lecture (13a), a *published* lecture whose parent subject is still draft (13b, the more subtle case), and listing lectures under a draft subject (13c) | ✅ (all three) |

### Lecture Items

| # | Scenario | Test | Result |
|---|---|---|---|
| 14 | Anonymous → 401 | "Lecture Items > 14" | ✅ |
| 15 | Authenticated → allowed where authorized | "Lecture Items > 15" (also confirms embedded file metadata for a `pdf` item) | ✅ |
| 16 | Invalid lecture ID → 400 | "Lecture Items > 16" | ✅ |

### Files

| # | Scenario | Test | Result |
|---|---|---|---|
| 17 | File metadata does not expose private credentials | "File metadata safety > 17/18/19" | ✅ |
| 18 | No direct unrestricted storage URL | same test — asserts no `url`/`storageKey`/`storage_key` field anywhere in the response | ✅ |
| 19 | No signed URL generated in Phase 07 | same test — asserts no `signedUrl` field; separately, `files/filesRoutes.ts`'s signed-URL route remains `501` (code-reviewed, unchanged from Phase 6) | ✅ |

### Authorization

| # | Scenario | Test | Result |
|---|---|---|---|
| 20 | Forged role → rejected | Phase 6 `auth.test.ts` "ignores a forged role claim" (still passing; not duplicated in `content.test.ts` since the mechanism is identical for content routes — they use the same `req.user.role`) | ✅ |
| 21 | Forged user ID → rejected | Phase 6 `auth.test.ts` (same test as #20 also asserts resolved `id` ≠ injected `user_id`) | ✅ |
| 22 | Normal user cannot access admin-only endpoint | `content.test.ts` "Security > 22" (`GET /admin/users` → 403) | ✅ |

### Security

| # | Scenario | Test | Result |
|---|---|---|---|
| 23 | SQL-injection-style input safely handled | "Security > 23" — `' OR '1'='1` as a path parameter → `400`, and the `subjects` table is confirmed unaffected (still exactly 2 rows) | ✅ |
| 24 | Excessive pagination limit rejected | "Security > 24" — `limit=99999` → `400 validation_error` (not clamped) | ✅ |
| 25 | Error response does not leak internal details | "Security > 25" — asserts the error body has exactly `{code, message}` and no stack/SQL-pattern text anywhere in the serialized response | ✅ |
| 26 | service-role key absent from client-visible code | "Security > 26" (backend responses) + Phase 6 `web/tests/unit/noServiceRoleKeyInClient.test.ts` (web source) — together cover both sides | ✅ |

### Quiz Security

| # | Scenario | Test | Result |
|---|---|---|---|
| 27 | `is_correct` never appears in normal content responses | "Quiz answer-key boundary > 27" — checks subjects list, subject detail, lecture detail, lecture items, and an *admin's* subject-detail call, plus confirms the quiz endpoint itself is still `501` | ✅ |

## What This Phase Did Not Need to Test (and Why)

- **Real Supabase/Postgres-as-a-service behavior** — Phase 7's content queries are plain parameterized SQL via `pg`; nothing about them is Supabase-specific (unlike Phase 6's OAuth handshake). The local database is not a weaker substitute for this phase's purposes — see `API_SECURITY.md` §14.
- **Admin content-management (write) endpoints** — not built this phase (`API_V1.md` "Administrative"), so nothing to test yet.
- **Storage/signed URLs** — explicitly out of scope (`PHASE 07` instructions); `filesRoutes.ts` remains `501`, unchanged and re-confirmed as still `501` by test #19.
- **Rate limiting under actual load** — verified structurally (headers present, limits configured correctly) via manual `curl` in this session, not via an automated high-volume test, which would be disproportionate for this phase's scope. See `API_SECURITY.md` §11 for the manual verification performed.

## Known Limitation of the Test Suite Itself

`fileParallelism: false` trades some wall-clock test speed for determinism against a shared database (§"Test Environment" above). At the current suite size (58 tests, ~6 seconds) this is not a practical concern; it is named here as a decision that would need revisiting if the suite grows an order of magnitude larger (e.g., by giving each test file its own transaction-wrapped-and-rolled-back connection instead of `truncate`, or its own schema).
