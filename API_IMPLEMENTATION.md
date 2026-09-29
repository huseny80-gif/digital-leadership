# API Implementation

Status: Phase 7. Describes how the Educational Content APIs were built, and the layering/architecture decisions made along the way — companion to `API_V1.md` (the contract) and `API_SECURITY.md` (the security reasoning).

## 1. Layering (Unchanged Structure, Now Filled In)

Phase 4 scaffolded the module boundary `Routes -> Service -> Repository -> Database` (`ARCHITECTURE.md` §3); Phase 7 is the first phase to actually implement it end-to-end for content, replacing the `NotImplementedContentRepository` placeholder:

```
content/contentRoutes.ts, content/lectureRoutes.ts   (HTTP <-> service translation only)
        ↓
content/contentService.ts                             (visibility rules, 404 semantics)
        ↓
content/contentRepository.ts (PgContentRepository)     (parameterized SQL via `pg`)
        ↓
PostgreSQL (local test DB today; Supabase-hosted once Phase 5's project exists)
```

No route handler contains a SQL query or a `pg.query()` call — every one goes through `ContentService`, which goes through `PgContentRepository`. This was verified by code review of every new file, not just asserted.

## 2. No New Abstraction Layers Introduced

Per `PHASE 07 §15`'s "avoid unnecessary abstraction... the goal is maintainable code, not maximum number of layers": no new controller layer, no DTO-mapping library, no ORM was introduced. `pg`'s raw parameterized queries plus small `toSubject`/`toLecture`/`toLectureItem` mapping functions (snake_case DB rows → camelCase API shapes) are the entire "layer" between SQL and the shared TypeScript types — this matches the level of abstraction Phase 6 already established in `usersRepository.ts` and was judged sufficient rather than adding an ORM mid-project.

## 3. DTOs Are the Existing Shared Types

Per `API_V1.md`, `SubjectResponse`/`LectureResponse`/`LectureItemResponse`/`FileMetadataResponse`/`UserProfileResponse` are not new, separately-maintained types — they are the `Subject`/`Lecture`/`LectureItemResponse`/`FileMetadata`/`UserProfile` types already defined in `shared/src/types/` since Phase 4, which were already API-shaped (camelCase, no `deleted_at`, no internal-only columns) rather than raw database rows. `LectureItemResponse` (new in this phase) is the one addition: the base `LectureItem` plus an embedded, already-safe `file` field. This satisfies "use shared TypeScript contracts... keep contracts compatible with Web and Flutter" without inventing a redundant duplicate type hierarchy.

## 4. Visibility Enforcement Lives in One Place

Each repository method takes an explicit `isAdmin: boolean` and applies exactly one of two SQL predicates (`""` for admin, `"and status = 'published'"` otherwise) — there is no visibility logic duplicated in the service layer, the route layer, or scattered across multiple query variants. `ContentService`'s `getSubjectOrThrow`/`getLectureOrThrow` add only 404-mapping on top ("not found" and "not visible" produce the identical response — `API_SECURITY.md` §3), never a second visibility check that could drift out of sync with the repository's.

## 5. Pagination Implementation

`backend/src/lib/validation.ts`'s `parsePagination()` is called once per collection route, producing `{ page, limit, offset }`; `PgContentRepository` uses `limit $n offset $n` in SQL plus a parallel `count(*)` query with the identical visibility predicate (never a different one — a mismatch here would be a real, subtle bug: the `total` could disagree with what pages actually return). This was verified in `API_TEST_PLAN.md`'s "subject list never includes draft subjects... even across pages" test using `limit=100`.

## 6. Validation Implementation

`requireUuidParam(name)` and `parsePagination(query)` are both `zod`-based, applied as Express middleware/inline calls respectively — consistent with the `zod` usage already established in `backend/src/config/env.ts` since Phase 4 (no new validation library was introduced).

## 7. Error Contract Implementation

No changes to `backend/src/middleware/errorHandler.ts` were needed — the Phase 4 design (a single place formatting every `HttpError` into `{error: {code, message}}`) already generalized correctly to the new `400`/`404` cases this phase introduces. Two new `HttpError` factory functions were added to `backend/src/lib/httpError.ts`: `notFound(resource)` and `conflict(message)` (the latter unused by any route yet, added because `PHASE 07 §14` asks for the full status code set to be available, for future write endpoints).

## 8. CORS and Rate Limiting Implementation

Both added in `backend/src/app.ts` using well-established libraries (`cors`, `express-rate-limit`) rather than hand-rolled logic — consistent with `TECH_STACK.md`'s general preference for managed/library solutions over custom security-sensitive code. Configuration is environment-driven (`CORS_ALLOWED_ORIGINS`), not hardcoded, per `ENVIRONMENT.md`'s existing pattern.

## 9. What Changed vs. What Was Added

**New files:** `backend/src/lib/validation.ts`, `backend/src/middleware/rateLimit.ts`, `backend/src/content/lectureRoutes.ts`, `backend/tests/helpers/seedFixtures.ts`, `backend/tests/integration/content.test.ts`.

**Rewritten (were placeholders):** `backend/src/content/contentRepository.ts` (was `NotImplementedContentRepository`), `backend/src/content/contentService.ts` (was a single pass-through method), `backend/src/content/contentRoutes.ts` (added the two new subject routes; the `/subjects` list route already existed).

**Modified (small, additive):** `backend/src/app.ts` (CORS + rate limiting wiring), `backend/src/routes/index.ts` (mounted `/lectures` and top-level `/me`), `backend/src/users/usersRoutes.ts` (extracted `meHandler` for reuse at two paths), `backend/src/config/env.ts` (added `CORS_ALLOWED_ORIGINS`), `backend/src/lib/httpError.ts` (added `notFound`/`conflict`), `backend/vitest.config.ts` (`fileParallelism: false`), `shared/src/contracts/api.ts` (`Paginated<T>` → `PaginatedResult<T>`, the former was never used anywhere), `shared/src/types/content.ts` (added `LectureItemResponse`).

**Untouched:** every Phase 5 migration file, every Phase 6 authentication file, `admin/adminRoutes.ts`, `assessments/assessmentsRoutes.ts`, `files/filesRoutes.ts` (all remain exactly as Phase 6 left them), and everything under `web/`, `mobile/`.

## 10. Live Supabase Verification Status

Unchanged from Phase 5/6: no live Supabase project exists in this environment. Everything in this phase was verified against the same local PostgreSQL substitute strategy — see `API_TEST_PLAN.md` and `API_SECURITY.md` §14 for why this is sufficient evidence for what this phase actually implements (plain parameterized SQL, nothing Supabase-specific).
