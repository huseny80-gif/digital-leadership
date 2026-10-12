-- Encryption happens only in the trusted backend. Browser roles continue
-- to have no SELECT or write grant and no RLS policy for private responses.
alter table participant_feedback add column if not exists message_ciphertext text;
alter table participant_feedback add column if not exists internal_note_ciphertext text;
alter table participant_feedback add column if not exists submitted_name_ciphertext text;
alter table participant_feedback enable row level security;
revoke all on participant_feedback from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then revoke all on participant_feedback from anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then revoke all on participant_feedback from authenticated; end if;
end $$;
