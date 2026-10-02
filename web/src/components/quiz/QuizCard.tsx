import Link from "next/link";
import type { Quiz } from "@shared/index";

/** Phase 18.2 — restyled to the Finquiz-derived `.content-card` pattern
 * (globals.css). Same data/link, visual only. */
export function QuizCard({
  quiz,
  routeBasePath = "/quizzes",
}: {
  quiz: Quiz;
  /** Page-route prefix — `/quizzes` (default, unchanged) for a learner,
   * `/training/quizzes` for a joined guest. */
  routeBasePath?: string;
}) {
  return (
    <Link href={`${routeBasePath}/${quiz.id}`} className="content-card">
      <div className="content-card-head">
        <span className="content-card-num" aria-hidden="true">
          ❓
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="content-card-title">{quiz.title}</p>
          {quiz.description ? <p className="content-card-meta">{quiz.description}</p> : null}
        </div>
        {quiz.timeLimitSeconds ? (
          <span className="badge">{Math.round(quiz.timeLimitSeconds / 60)} min</span>
        ) : null}
      </div>
    </Link>
  );
}
