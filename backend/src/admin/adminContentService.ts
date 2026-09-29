import type { Pool } from "pg";
import type { Lecture, LectureItem, LectureItemType, PublicationStatus, Subject } from "@shared/index";
import type { AdminContentRepository } from "./adminContentRepository.js";
import { notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Admin business logic for the content hierarchy (PHASE 09C). Every
 * mutating method writes an audit log entry (`DATABASE_SECURITY.md` §8) —
 * never secrets/tokens/signed URLs, only small identifying fields.
 */
export class AdminContentService {
  constructor(private readonly pool: Pool, private readonly repository: AdminContentRepository) {}

  listSubjects(): Promise<Subject[]> {
    return this.repository.listSubjectsAdmin();
  }

  async getSubjectOrThrow(id: string): Promise<Subject> {
    const subject = await this.repository.getSubjectAdmin(id);
    if (!subject) throw notFound("Subject");
    return subject;
  }

  async createSubject(input: { title: string; description: string | null; orderIndex: number }, actorUserId: string): Promise<Subject> {
    const subject = await this.repository.createSubject({ ...input, createdBy: actorUserId });
    await writeAuditLog(this.pool, { actorUserId, action: "subject.created", entityType: "subject", entityId: subject.id, metadata: { title: subject.title } });
    return subject;
  }

  async updateSubject(
    id: string,
    fields: { title?: string; description?: string | null; orderIndex?: number; status?: PublicationStatus },
    actorUserId: string,
  ): Promise<Subject> {
    const updated = await this.repository.updateSubject(id, fields);
    if (!updated) throw notFound("Subject");
    await writeAuditLog(this.pool, { actorUserId, action: "subject.updated", entityType: "subject", entityId: id, metadata: { fields: Object.keys(fields) } });
    return updated;
  }

  async deleteSubject(id: string, actorUserId: string): Promise<void> {
    const deleted = await this.repository.softDeleteSubject(id);
    if (!deleted) throw notFound("Subject");
    await writeAuditLog(this.pool, { actorUserId, action: "subject.deleted", entityType: "subject", entityId: id });
  }

  listLectures(subjectId: string): Promise<Lecture[]> {
    return this.repository.listLecturesAdmin(subjectId);
  }

  async getLectureOrThrow(id: string): Promise<Lecture> {
    const lecture = await this.repository.getLectureAdmin(id);
    if (!lecture) throw notFound("Lecture");
    return lecture;
  }

  async createLecture(
    input: { subjectId: string; title: string; description: string | null; orderIndex: number },
    actorUserId: string,
  ): Promise<Lecture> {
    // Never trusts subjectId at face value — re-validated server-side
    // against a real row (PHASE 09C "Lecture Management").
    const subjectExists = await this.repository.subjectExists(input.subjectId);
    if (!subjectExists) throw new ValidationError("The specified subject does not exist.");
    const lecture = await this.repository.createLecture({ ...input, createdBy: actorUserId });
    await writeAuditLog(this.pool, { actorUserId, action: "lecture.created", entityType: "lecture", entityId: lecture.id, metadata: { subjectId: input.subjectId } });
    return lecture;
  }

  async updateLecture(
    id: string,
    fields: { title?: string; description?: string | null; orderIndex?: number; status?: PublicationStatus },
    actorUserId: string,
  ): Promise<Lecture> {
    const updated = await this.repository.updateLecture(id, fields);
    if (!updated) throw notFound("Lecture");
    await writeAuditLog(this.pool, { actorUserId, action: "lecture.updated", entityType: "lecture", entityId: id, metadata: { fields: Object.keys(fields) } });
    return updated;
  }

  async deleteLecture(id: string, actorUserId: string): Promise<void> {
    const deleted = await this.repository.softDeleteLecture(id);
    if (!deleted) throw notFound("Lecture");
    await writeAuditLog(this.pool, { actorUserId, action: "lecture.deleted", entityType: "lecture", entityId: id });
  }

  listItems(lectureId: string): Promise<LectureItem[]> {
    return this.repository.listItemsAdmin(lectureId);
  }

  async getItemOrThrow(id: string): Promise<LectureItem> {
    const item = await this.repository.getItemAdmin(id);
    if (!item) throw notFound("Lecture item");
    return item;
  }

  async createItem(
    input: {
      lectureId: string;
      itemType: LectureItemType;
      title: string;
      bodyText: string | null;
      fileId: string | null;
      orderIndex: number;
    },
    actorUserId: string,
  ): Promise<LectureItem> {
    const lectureExists = await this.repository.lectureExists(input.lectureId);
    if (!lectureExists) throw new ValidationError("The specified lecture does not exist.");
    if (input.fileId) {
      const fileExists = await this.repository.fileExists(input.fileId);
      if (!fileExists) throw new ValidationError("The specified file does not exist.");
    }
    const item = await this.repository.createItem({ ...input, createdBy: actorUserId });
    await writeAuditLog(this.pool, { actorUserId, action: "lecture_item.created", entityType: "lecture_item", entityId: item.id, metadata: { lectureId: input.lectureId, itemType: input.itemType } });
    return item;
  }

  async updateItem(
    id: string,
    fields: { title?: string; bodyText?: string | null; fileId?: string | null; orderIndex?: number; status?: PublicationStatus },
    actorUserId: string,
  ): Promise<LectureItem> {
    if (fields.fileId) {
      const fileExists = await this.repository.fileExists(fields.fileId);
      if (!fileExists) throw new ValidationError("The specified file does not exist.");
    }
    const updated = await this.repository.updateItem(id, fields);
    if (!updated) throw notFound("Lecture item");
    await writeAuditLog(this.pool, { actorUserId, action: "lecture_item.updated", entityType: "lecture_item", entityId: id, metadata: { fields: Object.keys(fields) } });
    return updated;
  }

  async deleteItem(id: string, actorUserId: string): Promise<void> {
    const deleted = await this.repository.softDeleteItem(id);
    if (!deleted) throw notFound("Lecture item");
    await writeAuditLog(this.pool, { actorUserId, action: "lecture_item.deleted", entityType: "lecture_item", entityId: id });
  }
}
