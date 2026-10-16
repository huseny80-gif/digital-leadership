-- New submissions have no account/session/name attached. Existing feedback
-- keeps its original review state and attribution; do not rewrite history.
alter table participant_feedback add column if not exists anonymous_submission_key text;

alter table participant_feedback drop constraint if exists participant_feedback_author_kind_check;
alter table participant_feedback add constraint participant_feedback_author_kind_check
  check (author_kind in ('user', 'guest', 'anonymous'));

alter table participant_feedback drop constraint if exists participant_feedback_anonymous_identity;
alter table participant_feedback add constraint participant_feedback_anonymous_identity check (
  (author_kind = 'anonymous'
    and user_id is null and guest_session_id is null
    and submitted_name is null and submitted_name_ciphertext is null
    and anonymous_submission_key is not null
    and anonymous_submission_key ~ '^[0-9a-f]{64}$')
  or (author_kind in ('user', 'guest') and anonymous_submission_key is null)
);

-- A purpose-separated HMAC covers both principal and retry UUID, so retries
-- are idempotent without a stored identity or cross-submission pseudonym.
create unique index if not exists participant_feedback_anonymous_submission
  on participant_feedback (anonymous_submission_key) where anonymous_submission_key is not null;
