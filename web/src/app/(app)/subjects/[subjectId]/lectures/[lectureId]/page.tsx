/**
 * Single lecture view — will render lecture items (PDF/Summary/Assignment/
 * Exercise, per DATABASE_DESIGN.md §3) and any attached quiz. Structural
 * placeholder only.
 */
export default async function LecturePage({
  params,
}: {
  params: Promise<{ subjectId: string; lectureId: string }>;
}) {
  const { subjectId, lectureId } = await params;
  return (
    <section>
      <h1>Lecture</h1>
      <p>
        Structural placeholder for lecture {lectureId} in subject {subjectId}.
      </p>
    </section>
  );
}
