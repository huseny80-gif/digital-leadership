import type { Lecture, LectureItem, Subject } from "@shared/index";

/**
 * Data-access boundary for educational content (DATABASE_DESIGN.md §2-3).
 * Implemented against Postgres/Supabase in Phase 5; kept as an interface
 * here so the service layer never depends on a specific database client
 * directly (ARCHITECTURE.md §3).
 */
export interface ContentRepository {
  listPublishedSubjects(): Promise<Subject[]>;
  getSubjectById(id: string): Promise<Subject | null>;
  listLecturesForSubject(subjectId: string): Promise<Lecture[]>;
  listItemsForLecture(lectureId: string): Promise<LectureItem[]>;
}

export class NotImplementedContentRepository implements ContentRepository {
  async listPublishedSubjects(): Promise<Subject[]> {
    throw new Error("Not implemented: database connection is added in Phase 5.");
  }
  async getSubjectById(): Promise<Subject | null> {
    throw new Error("Not implemented: database connection is added in Phase 5.");
  }
  async listLecturesForSubject(): Promise<Lecture[]> {
    throw new Error("Not implemented: database connection is added in Phase 5.");
  }
  async listItemsForLecture(): Promise<LectureItem[]> {
    throw new Error("Not implemented: database connection is added in Phase 5.");
  }
}
