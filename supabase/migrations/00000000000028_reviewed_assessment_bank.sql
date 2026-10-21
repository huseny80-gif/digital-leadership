-- Expand bounded assessment metadata and bank size without changing any
-- existing question, edition, attempt, answer, archive or score.
alter table questions drop constraint if exists questions_difficulty_check;
alter table questions add constraint questions_difficulty_check
  check (difficulty in ('easy','medium','hard','very_hard'));

alter table exam_material_groups drop constraint if exists exam_material_groups_question_count_check;
alter table exam_material_groups add constraint exam_material_groups_question_count_check
  check (question_count between 1 and 500);
