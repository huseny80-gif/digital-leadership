import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { LibraryEntry, StudyCatalog, StudySourceChoice } from "@shared/index";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { LibraryService } from "../finquiz/catalog.js";
import { finquizRecordId } from "../finquiz/recordIdentity.js";
import { aiAssessmentReview, reviewedAiPdf } from "../contentAutomation/aiAssessmentReviewCatalog.js";
import { isAssessmentAppendixTitle, readableStudyText } from "../examMaterials/summary.js";
import type { PaginationParams } from "../lib/validation.js";

export interface StudySource extends StudySourceChoice {
  text: string;
  author: string | null;
  date: string | null;
  publisher: string | null;
  referenceUrl: string | null;
  order: number;
}
interface LectureRow { id: string; title: string; description: string | null; order_index: number }
interface ItemRow { id: string; lecture_id: string; title: string; item_type: string; body_text: string | null }
interface AssignmentRow { id: string; title: string; description: string | null; lecture_id: string | null; order_index: number }
function entryText(entry: LibraryEntry): string[] {
  return [entry.description ?? "", ...(entry.keyPoints ?? []), ...(entry.concepts ?? []).map(c => `${c.term}: ${c.definition}`), ...entry.files.filter(file => !isAssessmentAppendixTitle(file.label) && !isAssessmentAppendixTitle(file.filename)).map(file => file.bodyHtml ?? "")];
}

/** Published course text only. This reader never queries answers, submissions,
 * participant feedback, account data, or arbitrary user-supplied URLs. */
export class StudySources {
  private readonly content: ContentService;
  private readonly library: LibraryService;
  constructor(private readonly pool: Pool) {
    this.content = new ContentService(new PgContentRepository(pool));
    this.library = new LibraryService(this.content);
  }
  async subjects(): Promise<StudyCatalog["subjects"]> {
    const rows = await this.pool.query<{ id: string; title: string }>("select id,title from subjects where status='published' and deleted_at is null order by order_index,title,id");
    return rows.rows;
  }
  async catalog(subjectId: string | undefined, pagination: PaginationParams): Promise<StudyCatalog> {
    const [subjects, sources] = await Promise.all([this.subjects(), subjectId ? this.read(subjectId) : Promise.resolve([])]);
    return { subjects, sources: sources.slice(pagination.offset, pagination.offset + pagination.limit).map(({ id, kind, subjectId, title, subjectTitle, href, ready }) => ({ id, kind, subjectId, title, subjectTitle, href, ready })), total: sources.length, page: pagination.page };
  }
  async read(subjectId: string): Promise<StudySource[]> {
    const subject = await this.content.getSubjectOrThrow(subjectId, false);
    const visible = "l.status='published' and l.deleted_at is null";
    const [lectures, items, assignments, library] = await Promise.all([
      this.pool.query<LectureRow>(`select l.id,l.title,l.description,l.order_index from lectures l where l.subject_id=$1 and ${visible} order by l.order_index,l.title,l.id`, [subjectId]),
      this.pool.query<ItemRow>(`select i.id,i.lecture_id,i.title,i.item_type,i.body_text from lecture_items i join lectures l on l.id=i.lecture_id where l.subject_id=$1 and ${visible} and i.status='published' and i.deleted_at is null and i.item_type in ('summary','pdf') order by l.order_index,i.order_index,i.id`, [subjectId]),
      this.pool.query<AssignmentRow>(`select a.id,a.title,a.description,a.lecture_id,a.order_index from assignments a left join lectures l on l.id=a.lecture_id where a.subject_id=$1 and a.status='published' and a.deleted_at is null and (a.lecture_id is null or (${visible} and l.subject_id=a.subject_id)) order by a.order_index,a.id`, [subjectId]),
      this.library.get(subjectId, false),
    ]);
    const eligible = library.entries.filter(entry => ["lectures", "summaries", "assignments"].includes(entry.section) && !isAssessmentAppendixTitle(entry.title));
    const reviewByLecture = new Map<string, string>();
    if (subjectId === aiAssessmentReview.subjectId) for (const entry of eligible.filter(entry => entry.section === "lectures" && entry.lectureId)) {
      for (const file of entry.files.filter(file => file.filename.endsWith(".pdf") && file.sizeBytes <= 20 * 1024 * 1024 && !isAssessmentAppendixTitle(file.filename))) {
        const asset = await this.library.file(subjectId, file.id, false);
        const bytes = Buffer.concat(await Promise.all(asset.absolutePaths.map(path => readFile(path))));
        const reviewed = reviewedAiPdf(bytes);
        if (reviewed) reviewByLecture.set(entry.lectureId!, reviewed.text);
      }
    }
    const make = (id: string, kind: StudySource["kind"], title: string, text: string, href: string, order: number, entry?: LibraryEntry): StudySource => ({
      id, kind, subjectId, title, text, href, order, subjectTitle: subject.title, ready: text.length >= 70,
      author: entry?.author?.trim() || null, date: entry?.year ? String(entry.year) : entry?.date?.slice(0, 4) || null,
      publisher: entry?.publisher?.trim() || null, referenceUrl: entry?.url && /^https?:\/\//i.test(entry.url) ? entry.url : null,
    });
    const result: StudySource[] = lectures.rows.map(lecture => {
      const entries = eligible.filter(entry => entry.lectureId === lecture.id && ["lectures", "summaries"].includes(entry.section));
      const body = readableStudyText([lecture.description ?? "", ...entries.flatMap(entryText), ...items.rows.filter(item => item.lecture_id === lecture.id && !isAssessmentAppendixTitle(item.title)).map(item => item.body_text ?? ""), reviewByLecture.get(lecture.id) ?? ""]);
      return make(lecture.id, "lecture", lecture.title, body, `/subjects/${subjectId}/lectures/${lecture.id}`, lecture.order_index, entries.find(entry => entry.section === "lectures"));
    });
    for (const item of items.rows.filter(item => item.item_type === "summary" && !isAssessmentAppendixTitle(item.title))) {
      result.push(make(item.id, "summary", item.title, readableStudyText([item.body_text ?? ""]), `/subjects/${subjectId}/lectures/${item.lecture_id}`, lectures.rows.find(lecture => lecture.id === item.lecture_id)?.order_index ?? 0));
    }
    for (const entry of eligible.filter(entry => entry.section === "summaries")) {
      const text = readableStudyText(entryText(entry));
      // Imports may already expose the same summary as a lecture item.
      if (result.some(source => source.kind === "summary" && source.title === entry.title && source.text === text)) continue;
      result.push(make(finquizRecordId(`study-summary:${subjectId}:${entry.id}`), "summary", entry.title, text, `/subjects/${subjectId}/library?section=summaries&entry=${encodeURIComponent(entry.id)}`, lectures.rows.find(lecture => lecture.id === entry.lectureId)?.order_index ?? 0, entry));
    }
    for (const assignment of assignments.rows) {
      const entry = eligible.find(entry => entry.assignmentId === assignment.id);
      const text = readableStudyText([assignment.description ?? "", ...(entry ? entryText(entry) : [])]);
      result.push(make(assignment.id, "assignment", assignment.title, text, `/subjects/${subjectId}/assignments/${assignment.id}`, assignment.order_index, entry));
    }
    return result.sort((a, b) => a.order - b.order || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, "ar") || a.id.localeCompare(b.id));
  }
}
