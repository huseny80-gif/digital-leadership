-- LOCAL VERIFICATION ONLY. Never run this against a real Supabase project
-- (Supabase already provides its own `auth` schema, `auth.uid()`
-- function, and `anon`/`authenticated`/`service_role` Postgres roles as
-- part of its managed platform — applying this file there would conflict
-- with what Supabase manages itself).
--
-- This file exists solely so DATABASE_TEST_PLAN.md's scenarios can be run
-- against a plain local PostgreSQL instance in an environment with no
-- Supabase project access, by reproducing just enough of Supabase's
-- runtime surface (the `auth.uid()` function and its three standard
-- roles) for the RLS policies in migration 11 to evaluate correctly.
-- See DATABASE_IMPLEMENTATION_REPORT.md for exactly what this does and
-- does not prove about behavior on real Supabase.

create schema if not exists auth;

create or replace function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ language sql stable;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;
