/** Keep a lecture range readable left-to-right inside Arabic text. */
export function ExamGroupTitle({ title }: { title: string }) {
  const match = title.match(/^(.*)\((\d+-\d+)\)$/u);
  return match ? <>{match[1]}<bdi dir="ltr">({match[2]})</bdi></> : <>{title}</>;
}
