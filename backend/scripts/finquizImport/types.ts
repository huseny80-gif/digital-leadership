/**
 * Phase 20.1 — shared types for the Finquiz dry-run import engine.
 *
 * These mirror the Finquiz source shape (see huseny80-gif/Finquiz
 * data/subjects/*.js) on the "raw" side, and the Digital Leadership
 * production schema (supabase/migrations) on the "planned" side. Nothing
 * here is a database write — `Planned*` types describe rows this engine
 * *would* insert, for review only.
 */

export type FinquizQuestionType = "mcq" | "tf" | "fill" | "match" | "order" | "open";

export interface FinquizRubricItem {
  text: string;
  keywords: string[];
}

export interface FinquizFileRef {
  type: string;
  label?: string;
  title?: string;
  url: string | null;
}

export interface FinquizQuestion {
  id: string;
  lectureId?: string;
  type: FinquizQuestionType;
  difficulty?: string;
  kind?: string;
  prompt: string;
  options?: string[];
  answer?: number | boolean | string[];
  pairs?: Array<{ left: string; right: string }>;
  items?: string[];
  rubric?: FinquizRubricItem[];
  explanation?: string;
}

export interface FinquizQuiz {
  id: string;
  title: string;
  status?: string;
  description?: string;
  questions: FinquizQuestion[];
}

export interface FinquizLecture {
  id: string;
  number?: number;
  title: string;
  date?: string;
  status?: string;
  description?: string;
  objectives?: string[];
  files?: FinquizFileRef[];
}

export interface FinquizSummary {
  id: string;
  lectureId?: string;
  title: string;
  date?: string;
  status?: string;
  keyPoints?: string[];
  concepts?: Array<{ term: string; definition: string }>;
  terms?: string[];
  files?: FinquizFileRef[];
}

export interface FinquizAssignment {
  id: string;
  title: string;
  difficulty?: string;
  date?: string;
  due?: string | null;
  status?: string;
  demo?: boolean;
  description?: string;
  files?: FinquizFileRef[];
}

export interface FinquizReference {
  id: string;
  type?: string;
  status?: string;
  title: string;
  url?: string | null;
}

export interface FinquizResource {
  id: string;
  type?: string;
  title: string;
  date?: string;
  url?: string | null;
  status?: string;
}

export interface FinquizUpdate {
  id: string;
  date?: string;
  type?: string;
  title: string;
  body?: string;
  status?: string;
}

export interface FinquizSubject {
  id: string;
  order?: number;
  title: string;
  shortTitle?: string;
  icon?: string;
  accent?: string;
  status?: string;
  description?: string;
  lectures?: FinquizLecture[];
  summaries?: FinquizSummary[];
  assignments?: FinquizAssignment[];
  quizzes?: FinquizQuiz[];
  references?: FinquizReference[];
  resources?: FinquizResource[];
  updates?: FinquizUpdate[];
}

/** One row this engine would insert, if it were writing (it never does). */
export interface PlannedRow {
  table: string;
  /** Human-readable description of what this row represents. */
  summary: string;
  /** The Finquiz source id this row was derived from, for traceability. */
  sourceId: string;
  /** The fields that would be written, using production column names. */
  fields: Record<string, unknown>;
}

/** A Finquiz field/section this engine intentionally did NOT map, because
 * no production schema destination exists for it (Phase 19 §3 gaps). */
export interface SkippedItem {
  sourceId: string;
  reason: string;
  /** e.g. "summaries", "lectures.objectives" */
  category: string;
}

/** A potential conflict with existing production data, found by comparing
 * this plan against a production snapshot (see productionSnapshot.ts). */
export interface Conflict {
  severity: "info" | "warning" | "blocking";
  category: string;
  description: string;
  finquizSourceId?: string;
  productionId?: string;
}

export interface ProductionSnapshot {
  fetchedAt: string;
  /** How the snapshot was obtained — always stated, never implied. */
  source: string;
  subjects: Array<{ id: string; title: string; status: string }>;
  counts: Record<string, number>;
}

export interface ImportReport {
  generatedAt: string;
  engineVersion: string;
  sourceDir: string;
  dryRun: true;
  databaseWritesPerformed: 0;
  summary: {
    subjects: number;
    lectures: number;
    assignments: number;
    quizzes: number;
    questions: number;
    questionsByType: Record<string, number>;
    plannedRows: number;
    skippedItems: number;
    conflicts: number;
  };
  plannedRows: PlannedRow[];
  skippedItems: SkippedItem[];
  conflicts: Conflict[];
  productionSnapshot: ProductionSnapshot | null;
}
