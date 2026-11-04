-- Additive: a learner may practise a chosen subset of a quiz's questions
-- (several question types and lectures). NULL keeps every existing attempt
-- on the whole quiz, so history, grades and archives are untouched.
alter table public.quiz_attempts add column if not exists question_ids uuid[];
alter table public.quiz_attempts drop constraint if exists quiz_attempts_question_ids_nonempty;
alter table public.quiz_attempts add constraint quiz_attempts_question_ids_nonempty
  check (question_ids is null or cardinality(question_ids) between 1 and 500);
