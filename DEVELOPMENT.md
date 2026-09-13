# Development Guide

Status: Phase 4 (Scaffolding). This document explains how the repository is structured and how to run each project as it exists today — a structural skeleton with no business logic, database connection, or authentication implemented yet (see `IMPLEMENTATION_ROADMAP.md` for what comes next).

## Repository Structure

```
digital-leadership/
├── web/          Next.js + React + TypeScript web application
├── backend/      Node.js + Express + TypeScript backend API
├── mobile/       Flutter application (iOS + Android)
├── shared/       Shared TypeScript types/contracts (web + backend only)
├── *.md          Approved planning/architecture/database-design documents (Phases 1-3)
└── .env.example  Reference index — see ENVIRONMENT.md
```

This matches the target layout described in `PROJECT_STRUCTURE.md`, adjusted for what a real Next.js/Express/Flutter scaffold actually needs on disk.

### Why a `shared/` package, and why it doesn't cover mobile

`shared/` holds TypeScript types mirroring the API contract (`API_ARCHITECTURE.md`) — user, content, file, and quiz shapes, plus the generic API envelope. Both `web` and `backend` import it (as `@shared/*`) so they can never silently drift into two different ideas of what a `Subject` or a `QuizAttempt` looks like (`ARCHITECTURE.md` §12).

Flutter/Dart cannot import TypeScript source directly, so `mobile/lib/shared/models/` contains hand-maintained Dart mirrors of the same shapes instead. Keeping both clients honest against **one** documented contract (`API_ARCHITECTURE.md`) is what actually enforces consistency — the shared TypeScript package is a convenience for the two clients that can use it directly, not the sole mechanism.

## Running the Web Application

```
cd web
npm install
npm run dev
```

Serves at `http://localhost:3000`. Requires `web/.env.local` — copy `web/.env.example` first (see `ENVIRONMENT.md`).

Other useful commands (from `web/`):
- `npm run build` — production build.
- `npm run lint` — ESLint.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — Vitest unit/component tests.
- `npm run test:e2e` — Playwright end-to-end tests (requires `npx playwright install` once; see Known Limitations below).

## Running the Backend

```
cd backend
npm install
npm run dev
```

Serves at `http://localhost:4000` (configurable via `PORT`, see `ENVIRONMENT.md`). Requires `backend/.env` — copy `backend/.env.example` first. `GET /health` returns `{"status":"ok"}` once running; every other route currently returns `401 Unauthenticated` (no session mechanism exists yet — see `SECURITY_ARCHITECTURE.md` §14) or `501 Not Implemented` for routes reached after that guard, which is intentional scaffolding behavior, not a bug.

Other useful commands (from `backend/`):
- `npm run build` — compiles to `backend/dist/`.
- `npm run lint` — ESLint.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — Vitest unit + integration tests.

### Rebuilding `shared/` after changing it

The backend and web both consume `shared`'s **compiled output** (`shared/dist/`), not its TypeScript source directly (this avoids a cross-package `tsc` configuration problem — see the "Known Limitations" section). After editing anything under `shared/src/`, rebuild it before the change is visible to the other two projects:

```
cd shared
npm install
npm run build
```

## Running the Mobile App (Flutter)

See `mobile/README.md` for full detail, including an important caveat: **the Flutter/Dart SDK was not available in the environment this scaffolding was authored in**, so `mobile/` could not be verified with `flutter pub get`/`flutter analyze`/`flutter test` here. A developer with Flutter installed must run those commands (and generate the native `android/`/`ios/` platform folders via `flutter create .`) before Phase 9 feature work begins.

Once set up:
```
cd mobile
flutter pub get
flutter run
flutter test
```

## Testing Summary

| Project | Unit/Component | Integration | E2E |
|---|---|---|---|
| Web | Vitest + Testing Library (`web/tests/unit`) | — | Playwright (`web/tests/e2e`) |
| Backend | Vitest (`backend/tests/unit`) | Vitest + Supertest (`backend/tests/integration`) | — |
| Mobile | Flutter `test/unit` | — | Flutter `test/widget` |

Per `TECH_STACK.md` §8, tests gate every phase — the suites above are intentionally small in this scaffolding phase (a handful of tests proving the module boundaries and the "unauthenticated request is rejected" invariant) and grow as real features land, not the other way around.

## Where Future Supabase Configuration Belongs

No Supabase project exists yet, and none is created in this phase (`IMPLEMENTATION_ROADMAP.md` Phase 3/4). When Phase 5 (Database Implementation) creates one:
- Its connection details (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or a `DATABASE_URL`) go into `backend/.env` only — never into `web/.env.local` (the web client never talks to the database directly, per `ARCHITECTURE.md` §12, `DATABASE_SECURITY.md` §7).
- Migrations live under `backend/` (exact subdirectory chosen alongside the migration tool in Phase 4/5, per `DATABASE_MIGRATION_PLAN.md` §2) — not hand-run against a dashboard.
- The backend's `content`/`users`/`files`/`assessments` repository interfaces already scaffolded here (e.g., `backend/src/content/contentRepository.ts`) are exactly where the real Supabase-backed implementation will be added, replacing today's `NotImplemented*` placeholders.

## Quality Rules Applied in This Scaffold

- TypeScript `strict` mode is on in `web`, `backend`, and `shared`.
- Module boundaries mirror `ARCHITECTURE.md` §3: `backend/src/{auth,authorization,users,content,files,assessments,admin}` are separate directories, and routes never call the database directly — routes call services, services call repository interfaces.
- No business logic is duplicated between `web` and `backend`, or between the shared TypeScript types and the Dart mirrors beyond what's unavoidable across two languages.
- No fake or placeholder production credentials exist anywhere in the repository — every secret-shaped configuration value is either absent or explicitly documented as unset in `.env.example`.

## Known Limitations of This Scaffolding Phase

- **Flutter/Dart SDK unavailable** in the environment this scaffold was created in — `mobile/` is hand-authored to match `flutter create`'s standard structure but is unverified by `flutter analyze`/`flutter test`. See `mobile/README.md`.
- **Playwright browser binaries could not be downloaded** in this environment (the sandbox's network allowlist blocks `cdn.playwright.dev`). The e2e test infrastructure (`playwright.config.ts`, `tests/e2e/root.spec.ts`) is in place and will run once `npx playwright install` succeeds in an environment with that access.
- **`shared` is consumed via a manually-run build (`npm run build`), not an npm workspace.** This was a deliberate scope-limiting choice for this phase (see `DECISIONS.md` D29) — introducing npm workspaces was assessed as more machinery than this phase's "no unnecessary dependencies" rule justifies, but it is a reasonable follow-up if the manual-rebuild step proves annoying in practice.
- A moderate-severity dev-only dependency advisory exists for `vitest`'s bundled `@vitest/mocker` (path traversal in a local file the test runner reads) in both `web` and `backend`. It requires `vitest@5`, which itself requires `@types/node@^22`; upgrading both together triggered an unrelated npm resolver crash in this environment. Documented as a known issue to resolve — not a blocker for a scaffolding phase with zero production dependency exposure — in `PHASE_04_REPORT` and `TODO.md`.
