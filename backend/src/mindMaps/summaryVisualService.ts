import type { Pool } from "pg";
import type { Lecture, SummaryVisualDocument, SummaryVisualIndex } from "@shared/index";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { LibraryService, manifest, subjectMapping, type SourceLecture } from "../finquiz/catalog.js";
import { findSourceLecture } from "../finquiz/recordIdentity.js";
import { academicSummaryFor, type AcademicSummary } from "../finquiz/academicSummaries.js";
import { LectureSourceFiles } from "../examMaterials/lectureSourceFiles.js";
import { cyberRiskPrivateSourceId } from "../contentAutomation/cyberRiskSixthSource.js";
import { notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";
import { buildSourceSummaryVisuals, summaryVisualPolicy } from "./sourceSummaryVisuals.js";

const sixthChecksum = "8b7cc1cca073fa98ceacc56750a067295894d1a53e8f63dae72ac01599921a67";
interface Binding { lecture: Lecture; source?: SourceLecture; summary?: AcademicSummary }

export class SummaryVisualService {
  constructor(private readonly content: ContentService, private readonly library: Pick<LibraryService, "get">,
    private readonly sourceFiles: Pick<LectureSourceFiles, "read">) {}

  private async context(subjectId: string) {
    // Learning views use published content even for an administrator. Do not
    // let this new read route become a draft-content or cross-subject bypass.
    const subject = await this.content.getSubjectOrThrow(subjectId, false);
    const lectures = await this.content.listLecturesForSubjectOrThrow(subjectId, false, { page: 1, limit: 100, offset: 0 });
    const catalog = manifest.subjects.find(source => subjectMapping[source.id] === subjectId);
    const bindings: Binding[] = lectures.items.map(lecture => {
      const source = catalog?.lectures.find(source => findSourceLecture(source, lectures.items)?.id === lecture.id);
      const asset = source && Object.values(manifest.assets).find(asset => !asset.bodyHtml && asset.subjectSlug === catalog!.id && source.files?.some(file => file.url === asset.path));
      const privateSixth = subjectId === subjectMapping["cybersecurity-governance"] && lecture.catalogSourceId === cyberRiskPrivateSourceId && lecture.orderIndex === 6;
      const summary = academicSummaryFor(privateSixth ? sixthChecksum : asset?.sha256 ?? "");
      return { lecture, ...(source ? { source } : {}), ...(summary && summary.lectureId === (privateSixth ? "cs-l6" : source?.id) ? { summary } : {}) };
    });
    return { subject: { id: subject.id, title: subject.title }, bindings };
  }

  async index(subjectId: string): Promise<SummaryVisualIndex> {
    const context = await this.context(subjectId);
    return { policy: summaryVisualPolicy, subject: context.subject, lectures: context.bindings.map(({ lecture, source, summary }) => ({
      id: lecture.id, title: lecture.title, number: lecture.orderIndex || source?.number || 0, available: Boolean(summary),
      sectionCount: summary?.sections.length ?? 0, conceptCount: summary?.sections.reduce((total, section) => total + section.points.length, 0) ?? 0,
    })).sort((a, b) => a.number - b.number || a.title.localeCompare(b.title, "ar")) };
  }

  async detail(subjectId: string, lectureId: string): Promise<SummaryVisualDocument> {
    const context = await this.context(subjectId), binding = context.bindings.find(binding => binding.lecture.id === lectureId);
    if (!binding) throw notFound("المحاضرة غير متاحة.");
    if (!binding.summary) throw new ValidationError("لا يتوفر ملخص معتمد لهذه المحاضرة لإنشاء خريطة موثوقة.");
    const library = await this.library.get(subjectId, false);
    const { sources } = await this.sourceFiles.read(subjectId, [binding.lecture], library, "catalog");
    const documents = sources[0]?.documents;
    if (sources.length !== 1 || documents?.length !== 1 || documents[0]!.sha256 !== binding.summary.sha256) throw new ValidationError("تغيّر مصدر المحاضرة أو تعذر التحقق منه. أعد تحميل الصفحة بعد اعتماد الملخص الحالي.");
    try {
      return buildSourceSummaryVisuals({ subject: context.subject, lecture: { id: lectureId, title: binding.lecture.title, number: binding.lecture.orderIndex || binding.source?.number || 0 },
        summary: binding.summary, document: { filename: documents[0]!.filename, sha256: documents[0]!.sha256, text: documents[0]!.text } });
    } catch { throw new ValidationError("تعذر مطابقة مفاهيم الخريطة ومراجعها بالمصدر المعتمد. راجع ملخص المحاضرة أو أعد المحاولة."); }
  }
}

export function summaryVisualService(pool: Pool) {
  const content = new ContentService(new PgContentRepository(pool)), library = new LibraryService(content);
  return new SummaryVisualService(content, library, new LectureSourceFiles(pool, library));
}

/** Read-only production evidence: counts only, never source bodies, signed
 * links, credentials, participant records, quiz answers or grading metadata. */
export async function probePublishedSummaryVisuals(pool: Pool) {
  const service = summaryVisualService(pool), courses = [];
  for (const subjectId of Object.values(subjectMapping)) {
    const index = await service.index(subjectId);
    let documents = 0, concepts = 0, references = 0;
    for (const lecture of index.lectures.filter(lecture => lecture.available)) {
      const map = await service.detail(subjectId, lecture.id);
      documents++; concepts += map.sections.reduce((count, section) => count + section.points.length, 0);
      references += map.sections.reduce((count, section) => count + section.points.reduce((count, point) => count + point.evidence.length, 0), 0);
    }
    courses.push({ subjectId, documents, concepts, references, unavailableLectures: index.lectures.filter(lecture => !lecture.available).length });
  }
  return { policy: summaryVisualPolicy, courses, ready: courses.every(course => course.documents > 0 && !course.unavailableLectures) };
}
