# seismic/ — 7th Seismic Crew platform (scoped rules)

Inherits the repo-root CLAUDE.md (Sonnet default, `/effort low` for trivial edits).

## Boundaries
- Self-contained workspace. Never import from `web/`, `backend/` or `shared/`, and never edit them from a seismic task.
- `src/domain`, `src/planner`, `src/simulation` are **pure TypeScript**: no React, no DOM, no `Math.random` (use `createRng(seed)`).
- The 3D scene (`src/scene`) only reads the Zustand store; it never owns simulation logic.
- Equipment numbers in `domain/equipment.ts` are simulation defaults, not manufacturer specs. Don't present them as specs.

## Definition of done (goal loop)
Run from `seismic/`, and repeat until all three are green:
1. `npm run typecheck`
2. `npm test`
3. `npm run build`

New behaviour starts with a failing test in `tests/unit/`.

## Security
- Auth tokens are stored in `sessionStorage` (see `auth/session.ts`). Don't switch to `localStorage` without a decision record.
- Client-side roles only shape the UX. Real authorization belongs in Supabase RLS / the sync endpoint.
- Never put the Supabase service-role key in a `VITE_*` variable.
