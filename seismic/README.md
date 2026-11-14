# 7th Seismic Crew — Operations Center

An operations dashboard and **multi-agent vibroseis acquisition twin** for the
7th Seismic Crew. It runs as an offline-first PWA in React + Three.js, and it
shares one theme with the Flutter mobile app
(`mobile/lib/features/seismic/seismic_theme.dart`).

```bash
npm install            # from repo root (npm workspaces)
cd seismic
npm run dev            # http://localhost:5173 — runs in demo mode without Supabase
npm test               # 44 unit/component tests (Vitest + fake-indexeddb)
npm run build
```

## Architecture

```
src/
  theme/       tokens.ts (palette, glass, motion, WCAG contrast helpers) + theme.css
  domain/      equipment.ts (Nomad 65 Neo, Sercel 508XT, nodes, geophones, DGPS), survey.ts (grid geometry)
  planner/     executionPlan.ts — automated execution plan: line allocation → snake VP order → time-phased schedule
  simulation/  engine.ts — pure, seeded multi-agent reducer; rng.ts (mulberry32)
  store/       simulationStore.ts (Zustand) + useSimulationClock (rAF driver, independent of WebGL)
  offline/     syncQueue.ts — IndexedDB outbox with idempotency keys, exponential backoff, 4xx = permanent
  auth/        session.ts — Supabase PKCE client, tab-scoped session storage, role from app_metadata
  scene/       FieldOffice3D.tsx (lazy-loaded R3F scene), sceneMath.ts
  components/  GlassCard, StatTile, StatusBadge, FleetTable, EventLog, SyncStatus, ErrorBoundary
  pwa/         service-worker registration (public/sw.js caches the app shell; it never caches /api)
```

### Simulation agents
| Agent | Responsibility | Rule enforced |
|---|---|---|
| VibratorFleet | move → sweep → listen through its planned VPs | follows the planner's order |
| DGPS | RTK fix per fleet, random dropouts and recovery | **no sweep without a fix** |
| Recorder (508XT) | accepts one shot at a time, counts records | **holds shots when node faults exceed the QC limit** |
| NodeCrew | random node faults, sequential repair | brings the spread back into QC |

The same seed always produces the same run, so every behaviour is unit-testable.

### Offline sync contract
`POST VITE_SYNC_ENDPOINT` with `Idempotency-Key: <uuid>` and `Authorization: Bearer <supabase jwt>`.
The server **must** deduplicate on the key. Responses: `2xx` = done; `408`/`429`/`5xx` = retried with backoff;
any other `4xx` = dropped.

## Not yet built
- The sync endpoint and its Supabase table and RLS policies (the client contract is defined above).
- Sign-in UI. The client and session layer exist; without env vars the app runs in demo mode.
- The Flutter theme and its test are written, but no Flutter SDK was available, so they have not been run.
