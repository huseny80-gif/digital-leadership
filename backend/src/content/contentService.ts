import type { Assignment, Lecture, LectureItemResponse, Subject } from "@shared/index";
import type { ContentRepository } from "./contentRepository.js";
import type { PaginationParams } from "../lib/validation.js";
import { notFound } from "../lib/httpError.js";

/**
 * Business logic for educational content (PHASE 07 §15: routes call this,
 * this calls the repository — routes never touch data access directly).
 *
 * Every "get by ID" path here re-derives 404 vs. found purely from what
 * the repository's own visibility-aware query returns — there is no
 * separate "does it exist" check followed by a separate "can you see it"
 * check, which would risk the two falling out of sync. A non-admin
 * requesting a real but unpublished subject/lecture gets exactly the same
 * 404 as a nonexistent ID (SECURITY_ARCHITECTURE.md §13) — this is what
 * keeps PHASE 07 §17 (no regression of the Phase 5 anonymous-access bug,
 * generalized here to "no unpublished-content leak of any kind") true by
 * construction rather than by remembering to check it everywhere.
 */
export class ContentService {
  constructor(private readonly repository: ContentRepository) {}

  listSubjects(isAdmin: boolean, pagination: PaginationParams) {
    return this.repository.listSubjects(isAdmin, pagination);
  }

  async getSubjectOrThrow(id: string, isAdmin: boolean): Promise<Subject> {
    const subject = await this.repository.getSubjectById(id, isAdmin);
    if (!subject) throw notFound("Subject");
    return subject;
  }

  async listLecturesForSubjectOrThrow(subjectId: string, isAdmin: boolean, pagination: PaginationParams) {
    // Confirms the subject itself is visible before listing its lectures —
    // otherwise a caller could confirm a draft subject's existence by
    // noticing its lectures list returns empty vs. 404.
    await this.getSubjectOrThrow(subjectId, isAdmin);
    return this.repository.listLecturesForSubject(subjectId, isAdmin, pagination);
  }

  async getLectureOrThrow(id: string, isAdmin: boolean): Promise<Lecture> {
    const lecture = await this.repository.getLectureById(id, isAdmin);
    if (!lecture) throw notFound("Lecture");
    return lecture;
  }

  async listItemsForLectureOrThrow(
    lectureId: string,
    isAdmin: boolean,
    pagination: PaginationParams,
  ): Promise<{ items: LectureItemResponse[]; total: number }> {
    await this.getLectureOrThrow(lectureId, isAdmin);
    return this.repository.listItemsForLecture(lectureId, isAdmin, pagination);
  }

  async listAssignmentsForSubjectOrThrow(
    subjectId: string,
    isAdmin: boolean,
    pagination: PaginationParams,
  ): Promise<{ items: Assignment[]; total: number }> {
    // Same rationale as listLecturesForSubjectOrThrow: confirm the subject
    // itself is visible before listing its assignments, so a draft
    // subject's existence can't be inferred from an empty-vs-404 response.
    await this.getSubjectOrThrow(subjectId, isAdmin);
    return this.repository.listAssignmentsForSubject(subjectId, isAdmin, pagination);
  }
}
