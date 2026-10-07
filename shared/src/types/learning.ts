/** Personal data is resolved from the verified user or permanent guest session. */
export interface LearningOverview {
  totalLectures: number;
  completedLectures: number;
  totalAssignments: number;
  completedAssignments: number;
  totalQuizzes: number;
  completedQuizzes: number;
  progressPercentage: number;
  /** Active study time measured by the server, never inferred from completion. */
  learningSeconds: number;
  activities: LearningActivity[];
}

export type ActivityStatus = "pending" | "in_progress" | "completed" | "urgent";
export interface LearningActivity {
  id: string;
  kind: "assignment" | "quiz";
  title: string;
  subjectTitle: string;
  href: string;
  dueAt: string | null;
  overdue: boolean;
  status: ActivityStatus;
}

export interface AssignmentProgress {
  assignmentId: string;
  startedAt: string | null;
  completed: boolean;
  completedAt: string | null;
}

export type SearchContentKind = "lecture" | "summary" | "quiz" | "file";
export interface ContentSearchResult {
  id: string;
  kind: SearchContentKind;
  title: string;
  subjectTitle: string;
  href: string;
}
export interface ContentSearchResponse {
  query: string;
  results: ContentSearchResult[];
}
