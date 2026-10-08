import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LibraryAsset, LibraryEntry, LibrarySection, SubjectLibrary } from "@shared/index";
import type { ContentService } from "../content/contentService.js";
import { notFound } from "../lib/httpError.js";
import { findSourceLecture } from "./recordIdentity.js";

interface SourceRow {
  id: string; title: string; legacyTitles?: string[]; status?: string; lectureId?: string;
  description?: string; body?: string; date?: string; due?: string | null;
  difficulty?: string; demo?: boolean; objectives?: string[]; keyPoints?: string[];
  concepts?: Array<{ term: string; definition: string }>; terms?: string[];
  author?: string; publisher?: string; year?: string | number; note?: string; url?: string | null;
  files?: Array<{ url: string | null; label?: string; type: string }>;
}
interface SourceAsset { id: string; path: string; subjectSlug: string; filename: string; sizeBytes: number; sha256: string; bodyHtml?: string }
export interface SourceSubject {
  id: string; title: string; description?: string; order: number; status: string;
  lectures: Array<SourceRow & { number: number }>;
  summaries: SourceRow[]; assignments: SourceRow[]; references: SourceRow[];
  resources: SourceRow[]; updates: SourceRow[];
  quizzes: Array<{ id: string; title: string; status: string; description?: string; questions: Array<Record<string, unknown>> }>;
}
export interface CatalogManifest { sourceCommit: string; counts: Record<string, number>; subjects: SourceSubject[]; assets: Record<string, SourceAsset> }
export const catalogRoot = new URL("../../content/finquiz/", import.meta.url);
export const manifest = JSON.parse(readFileSync(new URL("catalog.json", catalogRoot), "utf8")) as CatalogManifest;
// Reuse the existing, previously approved subject identifiers. No parallel
// subject tree, database, authentication system or learner progress is created.
export const subjectMapping: Record<string, string> = {
  "ai-data": "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
  "legal-regulatory": "ade09563-02ec-4a09-a97b-58857f6cd876",
  "cybersecurity-governance": "bc861a76-620d-4646-81ca-c49d24665b75",
  "innovation-project-management": "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
  "risk-management": "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
};
const sections: LibrarySection[] = ["lectures", "summaries", "assignments", "references", "resources", "updates"];
const normalize = (s: string) => s.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا");
// Asset IDs are permanent download identities, independent of display names
// and physical paths. Arabic renames keep existing bookmarked downloads valid.
const assetsByPath = new Map(Object.values(manifest.assets).map(asset => [asset.path, asset]));
const safeUrl = (url?: string | null) => url && /^https?:\/\//i.test(url) ? url : null;

export class LibraryService {
  constructor(private readonly content: ContentService) {}

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
            files.push({ id: asset.id, filename: asset.filename, label: ref.label ?? asset.filename, sizeBytes: asset.sizeBytes, ...(asset.bodyHtml ? { bodyHtml: asset.bodyHtml } : {}) });
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
      entries.push({ id: "asset-" + asset.id, title: asset.filename, section: "resources", files: [{ id: asset.id, filename: asset.filename, label: asset.filename, sizeBytes: asset.sizeBytes, ...(asset.bodyHtml ? { bodyHtml: asset.bodyHtml } : {}) }], unavailableFiles: [] });
    }
    return { subjectId, entries, sourceQuestionCount: source.quizzes.reduce((n, q) => n + q.questions.length, 0) };
  }

  async file(subjectId: string, id: string, isAdmin: boolean) {
    const library = await this.get(subjectId, isAdmin);
    if (!library.entries.some(e => e.files.some(f => f.id === id && !f.bodyHtml))) throw notFound("File not found.");
    const asset = manifest.assets[id];
    if (!asset || asset.bodyHtml) throw notFound("File not found.");
    return { filename: asset.filename, absolutePath: fileURLToPath(new URL(asset.path, catalogRoot)) };
  }
}
