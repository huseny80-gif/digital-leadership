import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Lecture, LibraryAsset, LibraryEntry, LibrarySection, SubjectLibrary } from "@shared/index";
import type { ContentService } from "../content/contentService.js";
import { notFound } from "../lib/httpError.js";
import { findSourceLecture } from "./recordIdentity.js";
import { assetPaths } from "./assetFiles.js";
import { cyberRiskPrivateSourceId } from "../contentAutomation/cyberRiskSixthSource.js";
import type { uploadedStudyContent } from "./uploadedStudyContent.js";
import { STUDY_COURSES } from "@digital-leadership/shared";

interface SourceRow {
  id: string; title: string; legacyTitles?: string[]; status?: string; lectureId?: string;
  description?: string; body?: string; date?: string; due?: string | null;
  difficulty?: string; demo?: boolean; objectives?: string[]; keyPoints?: string[];
  concepts?: Array<{ term: string; definition: string }>; terms?: string[];
  author?: string; publisher?: string; year?: string | number; note?: string; url?: string | null;
  files?: Array<{ url: string | null; label?: string; type: string }>;
}
export interface SourceAsset { id: string; path: string; parts?: string[]; subjectSlug: string; filename: string; sizeBytes: number; sha256: string; bodyHtml?: string }
export interface SourceSubject {
  id: string; title: string; description?: string; order: number; status: string;
  lectures: Array<SourceRow & { number: number }>;
  summaries: SourceRow[]; assignments: SourceRow[]; references: SourceRow[];
  resources: SourceRow[]; updates: SourceRow[];
  quizzes: Array<{ id: string; title: string; status: string; description?: string; sourceReview?: string; lectureId?: string; questions: Array<Record<string, unknown>> }>;
}
export type SourceLecture = SourceSubject["lectures"][number];
export interface CatalogManifest { sourceCommit: string; counts: Record<string, number>; subjects: SourceSubject[]; assets: Record<string, SourceAsset> }
export const catalogRoot = new URL("../../content/finquiz/", import.meta.url);
export const manifest = JSON.parse(readFileSync(new URL("catalog.json", catalogRoot), "utf8")) as CatalogManifest;
// Reuse the existing, previously approved subject identifiers. No parallel
// subject tree, database, authentication system or learner progress is created.
export const subjectMapping: Record<string, string> = Object.fromEntries(STUDY_COURSES.map(course => [course.slug, course.id]));
const sections: LibrarySection[] = ["lectures", "summaries", "assignments", "references", "resources", "updates"];
const normalize = (s: string) => s.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا");
// Asset IDs are permanent download identities, independent of display names
// and physical paths. Arabic renames keep existing bookmarked downloads valid.
const assetsByPath = new Map(Object.values(manifest.assets).map(asset => [asset.path, asset]));
const safeUrl = (url?: string | null) => url && /^https?:\/\//i.test(url) ? url : null;

export class LibraryService {
  constructor(private readonly content: ContentService, private readonly uploadedReader?: (lecture: Lecture) => ReturnType<typeof uploadedStudyContent>) {}

  async get(subjectId: string, isAdmin: boolean): Promise<SubjectLibrary> {
    await this.content.getSubjectOrThrow(subjectId, isAdmin);
    const source = manifest.subjects.find(s => subjectMapping[s.id] === subjectId);
    if (!source) return { subjectId, entries: [], sourceQuestionCount: 0 };
    const page = { page: 1, limit: 100, offset: 0 };
    const [lectures, assignments] = await Promise.all([
      this.content.listLecturesForSubjectOrThrow(subjectId, isAdmin, page),
      this.content.listAssignmentsForSubjectOrThrow(subjectId, isAdmin, page),
    ]);
    const lectureIds = new Map(source.lectures.map(row => [row.id, findSourceLecture(row, lectures.items)?.id]));
    const entries: LibraryEntry[] = [];
    const referenced = new Set(sections.flatMap(section => source[section].flatMap(row => [
      ...(row.files ?? []).flatMap(file => file.url && assetsByPath.has(file.url) ? [assetsByPath.get(file.url)!.id] : []),
      ...(row.url?.startsWith("files/") && assetsByPath.has(row.url) ? [assetsByPath.get(row.url)!.id] : []),
    ])));
    for (const section of sections) {
      for (const row of source[section]) {
        if (!isAdmin && row.status !== "published") continue;
        // A summary tied to an unpublished or removed lecture follows the
        // same visibility as that lecture, even when the source says published.
        if (row.lectureId && !lectureIds.get(row.lectureId)) continue;
        if (section === "lectures" && !lectureIds.get(row.id)) continue;
        const assignmentId = section === "assignments" ? assignments.items.find(a => normalize(a.title) === normalize(row.title))?.id : undefined;
        if (section === "assignments" && !assignmentId) continue;
        const files: LibraryAsset[] = [];
        const unavailableFiles: string[] = [];
        const refs = [...(row.files ?? [])];
        if (row.url?.startsWith("files/")) refs.push({ type: "file", url: row.url, label: row.title });
        for (const ref of refs) {
          const asset = ref.url ? assetsByPath.get(ref.url) : undefined;
          if (asset && asset.subjectSlug === source.id) {
            files.push({ id: asset.id, filename: asset.filename, label: ref.label ?? asset.filename, sizeBytes: asset.sizeBytes, sha256: asset.sha256, ...(asset.bodyHtml ? { bodyHtml: asset.bodyHtml } : {}) });
          } else unavailableFiles.push(ref.label ?? ref.type);
        }
        const entry = {
          id: row.id, title: row.title, section, description: row.description ?? row.body,
          date: row.date, due: row.due, difficulty: row.difficulty, demo: row.demo,
          lectureId: lectureIds.get(section === "lectures" ? row.id : row.lectureId ?? ""),
          assignmentId,
          objectives: row.objectives, keyPoints: row.keyPoints, concepts: row.concepts, terms: row.terms,
          author: row.author, publisher: row.publisher, year: row.year, note: row.note,
          url: safeUrl(row.url), files, unavailableFiles,
        };
        entries.push(Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as unknown as LibraryEntry);
      }
    }
    // Include educational files present in the source but omitted from its
    // navigation, such as a second standalone lecture document.
    for (const asset of Object.values(manifest.assets)) {
      if (asset.subjectSlug !== source.id || referenced.has(asset.id)) continue;
      entries.push({ id: "asset-" + asset.id, title: asset.filename, section: "resources", files: [{ id: asset.id, filename: asset.filename, label: asset.filename, sizeBytes: asset.sizeBytes, sha256: asset.sha256, ...(asset.bodyHtml ? { bodyHtml: asset.bodyHtml } : {}) }], unavailableFiles: [] });
    }
    // Import after manifest initialization: the source reader also uses the
    // catalog for file identity. Visible lecture IDs still gate every result.
    const { catalogStudyContent } = await import("./catalogStudyContent.js");
    const unavailableSources = new Set<string>();
    const verified = await Promise.all(source.lectures.map(async lecture => {
      const lectureId = lectureIds.get(lecture.id);
      const asset = Object.values(manifest.assets).find(asset => asset.subjectSlug === source.id && !asset.bodyHtml
        && asset.filename.toLowerCase().endsWith(".pdf") && lecture.files?.some(file => file.url === asset.path));
      if (!lectureId || !asset) return null;
      try { return { lectureId, source: lecture, content: await catalogStudyContent(lecture, asset) }; }
      catch { unavailableSources.add(lectureId); return null; }
    }));
    const complete = verified.filter(item => item !== null);
    const completedIds = new Set(complete.map(item => item.lectureId));
    const currentEntries = entries.filter(entry => !(entry.section === "summaries" && entry.lectureId && (completedIds.has(entry.lectureId) || unavailableSources.has(entry.lectureId))));
    for (const entry of currentEntries) if (entry.section === "lectures" && entry.lectureId && unavailableSources.has(entry.lectureId)) {
      entry.files = entry.files.filter(file => !file.bodyHtml);
      for (const key of ["description", "objectives", "keyPoints", "concepts", "terms"] as const) delete entry[key];
      entry.unavailableFiles.push("تعذّر التحقق من الملف الأصلي؛ لا يُعرض ملخص قديم بدلًا منه");
    }
    for (const item of complete) {
      const lectureEntry = currentEntries.find(entry => entry.id === item.source.id && entry.section === "lectures");
      if (!lectureEntry) continue;
      // Retire the catalog's earlier generated HTML from the current view.
      // Download IDs, physical PDF bytes and instructor-authored items stay.
      lectureEntry.files = lectureEntry.files.filter(file => !file.bodyHtml);
      for (const key of ["description", "objectives", "keyPoints", "concepts", "terms"] as const) delete lectureEntry[key];
      lectureEntry.files.push({ id: `source-study-${item.content.assetId}-lecture`, filename: `${item.source.title} — المحتوى الدراسي.html`,
        label: "محتوى المحاضرة المستند إلى الملف الأصلي", sizeBytes: Buffer.byteLength(item.content.lectureHtml), bodyHtml: item.content.lectureHtml });
      const previous = entries.find(entry => entry.section === "summaries" && entry.lectureId === item.lectureId);
      currentEntries.push({ id: previous?.id ?? `source-study-${item.source.id}-summary`, title: `ملخص ${item.source.title}`, section: "summaries", lectureId: item.lectureId,
        files: [...lectureEntry.files.filter(file => !file.bodyHtml), { id: `source-study-${item.content.assetId}-summary`, filename: `${item.source.title} — الملخص الأكاديمي.html`, label: "الملخص الأكاديمي",
          sizeBytes: Buffer.byteLength(item.content.summaryHtml), bodyHtml: item.content.summaryHtml }], unavailableFiles: [] });
    }
    // The sixth cyber lecture is a verified private upload rather than a
    // bundled catalog PDF. Give it the same reading/summary surface.
    for (const lecture of lectures.items.filter(lecture => subjectId === subjectMapping["cybersecurity-governance"] && lecture.status === "published" && lecture.orderIndex === 6 && lecture.catalogSourceId === cyberRiskPrivateSourceId)) {
      try {
        const { uploadedStudyContent } = await import("./uploadedStudyContent.js");
        const content = await (this.uploadedReader ?? uploadedStudyContent)(lecture);
        for (const [section, html, label] of [["lectures", content.lectureHtml, "الشرح الدراسي من ملف المحاضرة"], ["summaries", content.summaryHtml, "الملخص الأكاديمي"]] as const) {
          currentEntries.push({ id: `source-study-upload-${lecture.id}-${section}`, title: section === "lectures" ? lecture.title : `ملخص ${lecture.title}`, section, lectureId: lecture.id,
            files: [{ id: `source-study-upload-${lecture.id}-${section}`, filename: `${lecture.title}.html`, label, sizeBytes: Buffer.byteLength(html), bodyHtml: html }], unavailableFiles: [] });
        }
      } catch {
        currentEntries.push({ id: `source-study-upload-${lecture.id}-unavailable`, title: lecture.title, section: "lectures", lectureId: lecture.id, files: [], unavailableFiles: ["تعذرت قراءة الشرح من الملف الأصلي قراءة موثوقة؛ أعد المحاولة أو راجع ملف PDF"] });
      }
    }
    return { subjectId, entries: currentEntries, sourceQuestionCount: source.quizzes.reduce((n, q) => n + q.questions.length, 0) };
  }

  async file(subjectId: string, id: string, isAdmin: boolean) {
    const library = await this.get(subjectId, isAdmin);
    if (!library.entries.some(e => e.files.some(f => f.id === id && !f.bodyHtml))) throw notFound("File not found.");
    const asset = manifest.assets[id];
    if (!asset || asset.bodyHtml) throw notFound("File not found.");
    return { filename: asset.filename, absolutePath: fileURLToPath(new URL(asset.parts?.[0] ?? asset.path, catalogRoot)), absolutePaths: assetPaths(asset, catalogRoot), sizeBytes: asset.sizeBytes };
  }
}
