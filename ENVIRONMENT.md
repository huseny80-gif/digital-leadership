# Environment Configuration

Status: Phase 4 (Scaffolding). Describes how environment variables are handled across the three runnable projects. No production environment exists yet (`IMPLEMENTATION_ROADMAP.md` Phase 11).

## Principle (binding, per `SECURITY_ARCHITECTURE.md` §10)

No password, API secret, OAuth client secret, service-role key, or database credential is ever hardcoded in source, committed to version control, or placed in a client-readable (`NEXT_PUBLIC_*`) variable. Every `.env*` file containing real values is git-ignored (see each project's `.gitignore`); only `*.env.example` files, containing placeholders, are committed.

## Files

| File | Committed? | Used by | Purpose |
|---|---|---|---|
| `.env.example` (repo root) | Yes | — | Reference index only; not read by any tool |
| `web/.env.example` | Yes | — | Template — copy to `web/.env.local` |
| `web/.env.local` | **No** | Next.js dev/build | Real local values |
| `backend/.env.example` | Yes | — | Template — copy to `backend/.env` |
| `backend/.env` | **No** | Backend dev/prod | Real local (or, via the deployment platform's secret store, production) values |

## Variable Reference

### Backend (`backend/.env`, validated by `backend/src/config/env.ts`)

| Variable | Introduced in | Sensitive? | Notes |
|---|---|---|---|
| `NODE_ENV` | Phase 4 | No | `development` \| `test` \| `production` |
| `PORT` | Phase 4 | No | Defaults to `4000` |
| `DATABASE_URL` | Phase 5 | **Yes** | Not used until Database Implementation |
| `SUPABASE_URL` | Phase 5 | No (URL only) | Not used until Database Implementation |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 5 | **Yes — highly privileged** | Bypasses RLS; never exposed to any client, never logged (`SECURITY_ARCHITECTURE.md` §10, §12) |
| `GOOGLE_OAUTH_CLIENT_ID` | Phase 6 | No | Matches the value used by `web`'s `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Phase 6 | **Yes** | Backend-only, never sent to any client |
| `SESSION_SIGNING_SECRET` | Phase 6 | **Yes** | Generate with a strong random value (e.g. `openssl rand -base64 32`) at implementation time |
| `FILE_STORAGE_BUCKET` | Phase 6/7 | No (identifier only) | Storage credentials themselves come from the storage provider's own configuration, not a bespoke variable here |

### Web (`web/.env.local`)

| Variable | Introduced in | Sensitive? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Phase 4 | No | e.g. `http://localhost:4000` in development |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | Phase 6 | No | OAuth client IDs are not secrets; the matching client *secret* stays backend-only |

**Rule of thumb for `web`:** if a value must never be visible to a browser, it does not belong in `web/.env.local` at all — it belongs in `backend/.env`, and the web client reaches it only indirectly through a backend API call.

### Mobile (Flutter)

No `.env` mechanism exists yet for `mobile/` in this phase — the app has no configuration to read (it makes no network calls yet). When Phase 9 adds the API client, a config approach consistent with the above rule (API base URL is safe to bundle; OAuth client secret is not) will be documented here before implementation, not decided ad hoc in code.

## Environments

Per `ARCHITECTURE.md` §15, at minimum **development** and **production** environments exist, each with its own set of these variables (never shared values, especially secrets, between them). A **staging** environment may be added later without requiring changes to this variable list — only to how many copies of it exist.

## Where Values Will Actually Come From (Future Phases)

- `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: the Supabase project's own settings page, once Phase 5 creates that project. Never invented or guessed.
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`: a Google Cloud Console OAuth 2.0 Client ID, created in Phase 6.
- `SESSION_SIGNING_SECRET`: generated once, per environment, at Phase 6 implementation time.
- `FILE_STORAGE_BUCKET`: the bucket/container name created alongside the storage provider in Phase 5/6.

None of the above exist yet. Setting any of them before their listed phase would be configuring a system this project has not built — this document fixes their *name and shape* now so later phases don't have to invent a new configuration surface, per `DEVELOPMENT.md`'s "no unnecessary dependencies / no temporary shortcuts" rule.
