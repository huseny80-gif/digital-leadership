-- Admin-recoverable sharing. Original hashes remain unchanged so that
-- every previously distributed link continues to resolve its own grant.
alter table training_access_grants
  add column if not exists share_token_hash text,
  add column if not exists share_token_ciphertext text,
  add column if not exists archived_at timestamptz;

create unique index if not exists training_access_grants_share_token_idx
  on training_access_grants (share_token_hash) where share_token_hash is not null;

-- Deleting a grant with participants would cascade into their results.
-- Remove unused disabled links; archive those that have participants.
delete from training_access_grants g
where g.revoked and not exists (
  select 1 from guest_training_sessions gs where gs.grant_id = g.id
);
update training_access_grants set archived_at = now()
where revoked and archived_at is null;
