-- Additive: old attempts, grades, archives and permanent guest access survive.
alter table public.quiz_attempts add column if not exists experience_mode text not null default 'learning'
  check (experience_mode in ('learning','challenge'));
alter table public.quiz_attempts add column if not exists time_limit_seconds integer
  check (time_limit_seconds between 300 and 7200);
alter table public.quiz_attempts add column if not exists deadline_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='quiz_attempts_challenge_deadline') then
    alter table public.quiz_attempts add constraint quiz_attempts_challenge_deadline check (
      (experience_mode='learning' and time_limit_seconds is null and deadline_at is null) or
      (experience_mode='challenge' and time_limit_seconds is not null and deadline_at is not null)
    );
  end if;
end $$;
create index if not exists quiz_attempts_challenge_restore_idx on public.quiz_attempts(quiz_id,experience_mode,started_at desc) where status='in_progress';

-- A direct authenticated PostgREST session cannot extend the server deadline
-- or inspect stored correctness before challenge submission. Service-role
-- grading continues to bypass RLS; legacy learning access is retained.
alter policy quiz_attempts_insert_own on public.quiz_attempts
  with check (user_id=auth.uid() and experience_mode='learning');
alter policy quiz_attempts_update_own_in_progress on public.quiz_attempts
  using (user_id=auth.uid() and status='in_progress' and experience_mode='learning')
  with check (user_id=auth.uid() and experience_mode='learning');
alter policy quiz_attempt_answers_select_own_or_admin on public.quiz_attempt_answers
  using (is_admin() or exists (select 1 from public.quiz_attempts qa where qa.id=quiz_attempt_answers.attempt_id and qa.user_id=auth.uid() and (qa.experience_mode='learning' or qa.status<>'in_progress')));
