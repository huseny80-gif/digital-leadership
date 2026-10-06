import type { Quiz } from "@shared/index";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

/** Document links always leave the quiz, including on direct/shared visits
 * and when a client-side transition is stalled. No history entry is required. */
export function QuizNavigation({ quiz, backHref }: {
  quiz?: Pick<Quiz, "subjectId"> | null;
  backHref?: string;
}) {
  const links = [
    ...(backHref ? [{ href: backHref, label: "رجوع", icon: "arrow" }] : []),
    ...(quiz?.subjectId ? [{ href: `/subjects/${quiz.subjectId}/assessments`, label: "اختبارات المادة", icon: "quiz" }] : []),
    { href: "/subjects?view=assessments", label: "جميع الاختبارات", icon: "quiz" },
    { href: "/subjects", label: "اختيار المادة أو الموضوع", icon: "book" },
  ];

  return <nav className="quiz-navigation" aria-label="التنقل من الاختبار">
    {links.map(link => <a key={link.href} href={link.href} className="btn btn-secondary">
      <PlatformIcon name={link.icon} /><span>{link.label}</span>
    </a>)}
  </nav>;
}
