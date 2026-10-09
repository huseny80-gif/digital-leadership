/** Static SQL fragments only; aliases are never taken from request input. */
export const examGroupVisible = `not exists (
  select 1 from unnest(g.lecture_ids) selected(id) left join lectures source on source.id=selected.id
  where source.id is null or source.deleted_at is not null or source.status<>'published' or source.subject_id<>g.subject_id
)`;
export const examQuizVisible = `(q.purpose='course' or exists (
  select 1 from exam_material_groups g where g.quiz_id=q.id and g.subject_id=q.subject_id and ${examGroupVisible}
))`;
