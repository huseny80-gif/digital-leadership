import type { Lecture, Subject } from "./content.js";
import type { Quiz, QuizAttempt, QuestionForAttempt, AttemptAnswer, SubmitAnswerAck, QuizAttemptResult } from "./quiz.js";

export interface ExamLectureSnapshot { id: string; title: string; number: number }
export interface ExamSummaryTopic { title: string; text: string; details?: string }
export interface ExamSummarySection extends ExamLectureSnapshot {
  text: string;
  keyPoints: string[];
  topics?: ExamSummaryTopic[];
  objectives?: string[];
  concepts?: Array<{ term: string; definition: string }>;
}
export interface ExamMaterialSummary {
  introduction: string;
  sections: ExamSummarySection[];
  version?: number;
  /** Original file digests bind this revision to its actual lecture sources. */
  grounding?: {
    policy: "strict-file-extraction-v1";
    sources: Array<{ lectureId: string; fileId: string; filename: string; sha256: string }>;
  };
}
export interface ExamMaterialGroup {
  id: string;
  subjectId: string;
  title: string;
  sequence: number;
  createdAt: string;
  lectures: ExamLectureSnapshot[];
  questionCount: number;
  quizId: string;
  /** Number of visible revisions of this exact lecture selection. */
  revisionCount?: number;
}
export interface ExamMaterialDetail extends ExamMaterialGroup {
  summary: ExamMaterialSummary;
  quiz: Quiz;
  /** Latest visible revision; the requested snapshot and quiz remain unchanged. */
  currentRevision?: ExamMaterialGroup;
  review?: ExamReviewArtifacts;
}
export type ExamExperienceMode = "learning" | "challenge";
export interface ExamMindMapNode {
  id: string;
  parentId: string | null;
  kind: "root" | "lecture" | "concept" | "topic";
  label: string;
  description: string;
  lectureId: string | null;
}
export interface ExamMindMapEdge { from: string; to: string; kind: "contains" | "shared" }
export interface ExamNarrationSegment {
  kind: "title" | "heading" | "body";
  /** Prepared spoken text only; the academic source remains unchanged. */
  text: string;
  pauseAfterMs: number;
}
export interface ExamAudioChapter { id: string; title: string; lectureId: string | null; chunks: string[]; segments?: ExamNarrationSegment[] }
export interface ExamReviewArtifacts {
  generator: "source-mock-v1";
  mindMap: { nodes: ExamMindMapNode[]; edges: ExamMindMapEdge[] };
  audioChapters: ExamAudioChapter[];
}
export interface ExamMaterialHistory {
  revisions: ExamMaterialGroup[];
  latestId: string;
  total: number;
  page: number;
}
export interface ExamMaterialIndex {
  subject: Subject;
  lectures: Lecture[];
  groups: ExamMaterialGroup[];
  canGenerate: boolean;
  total: number;
  page: number;
}
export interface ExamMaterialAttempt {
  quiz: Quiz;
  attempt: QuizAttempt;
  questions: QuestionForAttempt[];
  answers: AttemptAnswer[];
  feedback: SubmitAnswerAck[];
  result: QuizAttemptResult | null;
  /** Synchronizes the countdown with the server clock when restoring a challenge. */
  serverTime?: string;
  /** Available to the owning learner only after final grading. */
  knowledgeGaps?: ExamKnowledgeGapReport;
}

export interface ExamContextReference {
  paragraphId: string;
  fileId: string;
  filename: string;
  sha256: string;
  number: number;
  startLine: number;
  endLine: number;
  excerpt: string;
}
export interface ExamKnowledgeGap {
  id: string;
  lectureId: string;
  lectureTitle: string;
  topic: string;
  wrongQuestionIds: string[];
  unansweredQuestionIds: string[];
  references: ExamContextReference[];
}
export interface ExamKnowledgeGapReport {
  attemptId: string;
  incorrectAnswers: number;
  unansweredQuestions: number;
  unmappedQuestions: number;
  gaps: ExamKnowledgeGap[];
}
/** Never embedded in a learner-facing group/summary/attempt payload. */
export interface ExamInstructorGuide {
  groupId: string;
  generator: "strict-source-extractive-v1";
  items: Array<{
    id: string;
    lectureId: string;
    lectureTitle: string;
    topic: string;
    expectedGap: string;
    discussionQuestion: string;
    references: ExamContextReference[];
  }>;
}
