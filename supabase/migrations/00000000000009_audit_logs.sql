-- Phase 5 — migration 9 of 11: audit log (DATABASE_DESIGN.md §6).
-- Append-only; no update/delete path is granted to any application role
-- (enforced via RLS/grants in the RLS migration, not here).

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_actor_user_id_idx on audit_logs (actor_user_id);
create index audit_logs_created_at_idx on audit_logs (created_at);
