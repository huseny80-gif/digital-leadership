/**
 * Single subject view — lists its lectures (structural placeholder).
 */
export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return (
    <section>
      <h1>Subject</h1>
      <p>Structural placeholder for subject {subjectId}.</p>
    </section>
  );
}
