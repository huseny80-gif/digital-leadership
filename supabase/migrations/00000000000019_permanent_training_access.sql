-- Permanent training links and learner sessions, including previously
-- time-limited links. Keep token hashes, session IDs, attempts and progress.
alter table training_access_grants alter column expires_at drop not null;
alter table guest_training_sessions alter column expires_at drop not null;

update training_access_grants set expires_at = null where expires_at is not null;
update guest_training_sessions set expires_at = null where expires_at is not null;

-- Restore sessions stopped only by a time limit. Explicitly revoked links
-- and sessions retain their existing revocation behavior.
update guest_training_sessions gs set status = 'active'
where gs.status = 'expired'
  and exists (select 1 from training_access_grants g where g.id = gs.grant_id and not g.revoked);
