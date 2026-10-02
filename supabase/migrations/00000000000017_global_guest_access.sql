-- General guest learner access.
-- Access links now authorize entry to the learner platform as a whole,
-- not to one subject. Keep the legacy subject_id column nullable so
-- existing grants remain valid during rollout; application authorization
-- no longer uses it to scope guest content.
alter table training_access_grants
  alter column subject_id drop not null;

drop index if exists training_access_grants_subject_idx;
