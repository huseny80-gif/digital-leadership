import Link from "next/link";
import type { Quiz } from "@shared/index";

export function QuizCard({ quiz }: { quiz: Quiz }) {
  return (
    <Link href={`/quizzes/${quiz.id}`} className="item-row" style={{ display: "flex" }}>
      <div className="item-row-main">
        <p className="item-row-title">{quiz.title}</p>
        {quiz.description ? <p className="item-row-meta">{quiz.description}</p> : null}
      </div>
      {quiz.timeLimitSeconds ? (
        <span className="badge">{Math.round(quiz.timeLimitSeconds / 60)} min</span>
      ) : null}
    </Link>
  );
}
