import type { ActivityStatus } from "@shared/index";

export const activityStatusLabels: Record<ActivityStatus, string> = {
  pending: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  urgent: "عاجل",
};
export const formatArabicNumber = (value: number) =>
  new Intl.NumberFormat("ar", { numberingSystem: "arab" }).format(value);
export function formatLearningTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${formatArabicNumber(Math.floor(minutes / 60))} س ${formatArabicNumber(minutes % 60)} د`;
}
export function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat("ar", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
/** Only study routes send heartbeats; navigation and administration do not. */
export function learningResource(
  pathname: string,
): {
  kind: "lecture" | "assignment" | "quiz" | "library";
  contentId: string;
} | null {
  const uuid = "([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})";
  const lecture = pathname.match(
    new RegExp(`^/subjects/${uuid}/lectures/${uuid}$`, "i"),
  );
  if (lecture) return { kind: "lecture", contentId: lecture[2] };
  const assignment = pathname.match(
    new RegExp(`^/subjects/${uuid}/assignments/${uuid}$`, "i"),
  );
  if (assignment) return { kind: "assignment", contentId: assignment[2] };
  const quiz = pathname.match(new RegExp(`^/quizzes/${uuid}(?:/.*)?$`, "i"));
  if (quiz) return { kind: "quiz", contentId: quiz[1] };
  const library = pathname.match(
    new RegExp(`^/subjects/${uuid}/library$`, "i"),
  );
  return library ? { kind: "library", contentId: library[1] } : null;
}

export function notifyLearningProgress(): void {
  window.dispatchEvent(new Event("learning-progress-updated"));
}
