import Link from "next/link";
import type { Subject } from "@shared/index";

export function SubjectCard({ subject }: { subject: Subject }) {
  return (
    <Link href={`/subjects/${subject.id}`} className="card-link">
      <p className="card-title">{subject.title}</p>
      {subject.description ? <p className="card-description">{subject.description}</p> : null}
    </Link>
  );
}
