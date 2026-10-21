import type { Lecture, Subject } from "./content.js";
import type { Quiz, QuizAttempt, QuestionForAttempt, QuestionDifficulty, QuestionBloom, AttemptAnswer, SubmitAnswerAck, QuizAttemptResult } from "./quiz.js";

export interface ExamLectureSnapshot { id: string; title: string; number: number }
export interface ExamSummaryTopic {
  title: string; text: string; details?: string;
  /** Physical one-based page in the original PDF, including cover pages. */
  sourcePages?: Array<{ fileId: string; filename: string; sha256: string; page: number }>;
}
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
    assessmentPolicy?: "source-case-assessment-v1";
    summaryPolicy?: "visually-verified-legal-excerpts-v1";
    /** An automatic curriculum review explicitly selects its approved PDFs. */
    sourceScope?: "catalog-primary";
    questionPolicy?: "source-diverse-assessment-v1";
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

export type AcademicExamQuestionType = "multiple_choice" | "true_false" | "match" | "order" | "short_answer" | "case_study";
export interface AcademicExamQuestion {
  id: string;
  type: AcademicExamQuestionType;
  lectureId: string;
  lectureTitle: string;
  prompt: string;
  instructions: string;
  points: number;
  difficulty?: QuestionDifficulty;
  bloom?: QuestionBloom;
  options: string[];
  matchItems?: { left: string[]; right: string[] };
  orderItems?: string[];
  /** Locations establish provenance without revealing the answer quotation. */
  sources: Array<Omit<ExamContextReference, "excerpt">>;
}
export interface AcademicExamAnswer {
  questionId: string;
  modelAnswer: string;
  explanation: string;
  correctOptionIndex?: number;
  rubric: Array<{ criterion: string; expected: string; points: number; references: ExamContextReference[] }>;
  optionReviews: Array<{ text: string; rationale: string; references: ExamContextReference[] }>;
}
export interface AcademicExamPaper {
  policy: "strict-academic-exam-v1";
  groupId: string;
  title: string;
  questionSectionTitle: string;
  answerSectionTitle: string;
  totalPoints: number;
  distribution: Array<{ type: AcademicExamQuestionType; count: number; points: number }>;
  questions: AcademicExamQuestion[];
  /** Server omits this entirely until administrator access or a completed,
   * owned attempt. Written-response marks are a human grading guide. */
  answerKey?: AcademicExamAnswer[];
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
  /** Actual wrong decisions only; never inferred from an unanswered question. */
  decisions?: Array<{
    questionId: string;
    scenario: string;
    selectedOption: string;
    expectedOption: string;
    reason: string;
    criterion: string;
    skill: "decision" | "diagnosis" | "prioritization";
    references: ExamContextReference[];
  }>;
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
  generator: "strict-source-extractive-v1" | "source-verified-instructor-v2";
  /** Teaching preparation uses the currently verified lecture files, including
   * when viewed alongside an older, immutable quiz revision. */
  sourceScope?: "current-lecture-files";
  unavailableLectures?: Array<{ lectureId: string; lectureTitle: string }>;
  items: Array<{
    id: string;
    lectureId: string;
    lectureTitle: string;
    topic: string;
    scenario?: string;
    expectedGap: string;
    discussionQuestion: string;
    references: ExamContextReference[];
  }>;
}
