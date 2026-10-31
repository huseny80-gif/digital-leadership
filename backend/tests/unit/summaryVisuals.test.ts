import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { proofreadAcademicContent } from "@digital-leadership/shared";
import type { Lecture } from "@shared/index";
import { catalogRoot, manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import type { AcademicSummary } from "../../src/finquiz/academicSummaries.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { actualFileText } from "../../src/examMaterials/lectureSourceFiles.js";
import { ContentService } from "../../src/content/contentService.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { notFound } from "../../src/lib/httpError.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { academicPresentation } from "../../src/middleware/academicPresentation.js";
import { buildSourceSummaryVisuals } from "../../src/mindMaps/sourceSummaryVisuals.js";
import { SummaryVisualService } from "../../src/mindMaps/summaryVisualService.js";
import { summaryVisualRoutes } from "../../src/mindMaps/summaryVisualRoutes.js";

const summaries = (JSON.parse(readFileSync(new URL("academicSummaries.json", catalogRoot), "utf8")) as { summaries: AcademicSummary[] }).summaries;
const transcripts = (JSON.parse(readFileSync(new URL("extractedSources.json", catalogRoot), "utf8")) as { sources: Array<{ sha256: string; textSha256: string; text: string }> }).sources;
const normalization = (text: string) => text.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640\u200C-\u200F\u202A-\u202E\u2066-\u2069()]/gu, "").replace(/\s+/gu, " ").trim();
function build(summary: AcademicSummary, text = transcripts.find(source => source.sha256 === summary.sha256)!.text) {
  return buildSourceSummaryVisuals({ subject: { id: "subject", title: "المادة" }, lecture: { id: summary.lectureId, title: "المحاضرة", number: 1 }, summary, document: { filename: "المحاضرة.pdf", sha256: summary.sha256, text } });
}

describe("reviewed summary visuals and original transcript coordinates", () => {
  for (const summary of summaries) it(`retains every approved point and grounds every reference for ${summary.lectureId}`, async () => {
    const transcript = transcripts.find(source => source.sha256 === summary.sha256)!;
    expect(createHash("sha256").update(transcript.text).digest("hex")).toBe(transcript.textSha256);
    const asset = Object.values(manifest.assets).find(asset => asset.sha256 === summary.sha256 && !asset.bodyHtml);
    // The private sixth lecture is checked from actual storage bytes by the
    // service and the deployed read-only probe, never replaced by this bundle.
    if (asset) expect(await actualFileText(await readAsset(asset, catalogRoot), asset.filename, "application/pdf")).toEqual({ sha256: summary.sha256, text: transcript.text });
    else expect(summary.lectureId).toBe("cs-l6");
    const visual = build(summary), expected = summary.sections.flatMap(section => section.points);
    const points = visual.sections.flatMap(section => section.points);
    expect(points.map(point => ({ term: point.label, text: point.text, evidence: point.evidence.map(item => item.quote) }))).toEqual(expected);
    for (const point of points) for (const evidence of point.evidence) {
      const lines = transcript.text.split("\n").slice(evidence.startLine - 1, evidence.endLine).join("\n");
      expect(normalization(lines)).toContain(normalization(evidence.quote));
      expect(evidence.startLine).toBeGreaterThan(0);
    }
    const ids = new Set([...visual.sections.map(section => section.id), ...points.map(point => point.id)]);
    for (const sequence of visual.sequences) for (const step of sequence.steps) {
      expect(ids.has(step.pointId ?? step.sectionId ?? "")).toBe(true);
      const point = points.find(point => point.id === step.pointId);
      if (point) expect(point.text + point.label).toContain(step.label);
    }
    expect(visual.sequences.at(-1)).toMatchObject({ kind: "source_order", steps: visual.sections.map(section => ({ label: section.title, sectionId: section.id })) });
    if (summary.lectureId !== "cs-l1") expect(visual.triad).toBeUndefined();
    // The global response presentation layer must never rewrite evidence.
    expect(proofreadAcademicContent(visual).sections.flatMap(section => section.points.flatMap(point => point.evidence))).toEqual(points.flatMap(point => point.evidence));
  });
  it("covers the current 33 readings and 758 points, without duplicate point identities", () => {
    expect(summaries).toHaveLength(33);
    expect(summaries.flatMap(summary => summary.sections.flatMap(section => section.points))).toHaveLength(758);
    for (const summary of summaries) { const points = build(summary).sections.flatMap(section => section.points); expect(new Set(points.map(point => point.id)).size).toBe(points.length); }
  });
  it("fails closed on forged explanation, evidence, checksum and a changed transcript", () => {
    const summary = summaries[0]!;
    const changed = structuredClone(summary); changed.sections[0]!.points[0]!.text = "تفسير خارجي لا يرد في الملخص المعتمد.";
    expect(() => build(changed)).toThrow("summary_visual_source_mismatch");
    const forged = structuredClone(summary); forged.sections[0]!.points[0]!.evidence = ["حقيقة غير موجودة في هذا المصدر"];
    expect(() => build(forged)).toThrow("summary_visual_source_mismatch");
    expect(() => build({ ...summary, sha256: "0".repeat(64) }, "نص مزيف")).toThrow("summary_visual_source_mismatch");
    expect(() => build(summary, "نص لا يطابق الأدلة")).toThrow("summary_visual_source_mismatch");
  });
  it("keeps original line locations when normalization removes layout glyphs or follows an astral character", () => {
    const summary = summaries.find(summary => summary.lectureId === "cs-l1")!, text = transcripts.find(source => source.sha256 === summary.sha256)!.text;
    const baseline = build(summary), prefixed = build(summary, "🧭\n\n" + text);
    expect(prefixed.sections.flatMap(section => section.points.flatMap(point => point.evidence))).toEqual(baseline.sections.flatMap(section => section.points.flatMap(point => point.evidence.map(evidence => ({ ...evidence, startLine: evidence.startLine + 2, endLine: evidence.endLine + 2 })))));
  });
});

function fixture(slug = "ai-data", hidden = "") {
  const subjectId = subjectMapping[slug]!, source = manifest.subjects.find(subject => subject.id === slug)!;
  const lectures = source.lectures.filter(lecture => lecture.id !== hidden).map(lecture => ({ id: finquizRecordId(`lecture:${lecture.id}`), subjectId, title: "عنوان عدّله المدرّب", catalogSourceId: lecture.id, orderIndex: lecture.number })) as Lecture[];
  const content = { getSubjectOrThrow: vi.fn().mockResolvedValue({ id: subjectId, title: source.title }), listLecturesForSubjectOrThrow: vi.fn().mockResolvedValue({ items: lectures }) };
  const library = { get: vi.fn().mockResolvedValue({ subjectId, entries: [] }) };
  const files = { read: vi.fn().mockImplementation(async (_id: string, selected: Lecture[]) => ({ sources: selected.map(lecture => {
    const summary = summaries.find(summary => summary.lectureId === lecture.catalogSourceId)!, transcript = transcripts.find(source => source.sha256 === summary.sha256)!;
    return { lecture, documents: [{ id: "source", filename: "المحاضرة.pdf", sha256: summary.sha256, text: transcript.text }], paragraphs: [] };
  }), links: [] })) };
  return { content, library, files, lectures, subjectId, service: new SummaryVisualService(content as unknown as ContentService, library, files) };
}

describe("published summary visual service", () => {
  it("binds permanent lecture IDs and always enforces published visibility, including for an admin", async () => {
    const f = fixture(), index = await f.service.index(f.subjectId);
    expect(index.lectures).toHaveLength(6); expect(index.lectures.every(lecture => lecture.available)).toBe(true);
    const visual = await f.service.detail(f.subjectId, f.lectures[0]!.id);
    expect(visual.lecture.title).toBe("عنوان عدّله المدرّب"); expect(visual.sections.flatMap(section => section.points)).toHaveLength(18);
    expect(f.content.getSubjectOrThrow).toHaveBeenCalledWith(f.subjectId, false);
    expect(f.content.listLecturesForSubjectOrThrow).toHaveBeenCalledWith(f.subjectId, false, expect.any(Object));
    expect(f.library.get).toHaveBeenCalledWith(f.subjectId, false);
    expect(f.files.read).toHaveBeenCalledWith(f.subjectId, [f.lectures[0]], expect.any(Object), "catalog");
  });
  it("rejects a hidden subject, hidden or cross-subject lecture before reading its file", async () => {
    const f = fixture("ai-data", "ai-l1");
    for (const id of [finquizRecordId("lecture:ai-l1"), finquizRecordId("lecture:rm-l1")]) await expect(f.service.detail(f.subjectId, id)).rejects.toMatchObject({ status: 404 });
    f.content.getSubjectOrThrow.mockRejectedValue(notFound("hidden"));
    await expect(f.service.index(f.subjectId)).rejects.toMatchObject({ status: 404 }); expect(f.files.read).not.toHaveBeenCalled();
  });
  it("refuses stale bytes, multiple source editions, unsupported evidence and unavailable private files", async () => {
    for (const documents of [[], [{ sha256: "0".repeat(64), text: "نص مختلف" }], [{ sha256: summaries[0]!.sha256, text: "نص مزيف" }], [{ sha256: summaries[0]!.sha256 }, { sha256: summaries[0]!.sha256 }]]) {
      const f = fixture(); f.files.read.mockResolvedValue({ sources: [{ documents }], links: [] });
      await expect(f.service.detail(f.subjectId, f.lectures[0]!.id)).rejects.toMatchObject({ status: 400 });
    }
    const f = fixture(); f.files.read.mockRejectedValue(new Error("private_source_read_unavailable"));
    await expect(f.service.detail(f.subjectId, f.lectures[0]!.id)).rejects.toThrow("private_source_read_unavailable");
  });
});

describe("authenticated read-only visual routes", () => {
  function app() {
    const f = fixture(), factory = vi.fn().mockReturnValue(f.service), app = express();
    app.use((req, _res, next) => { if (req.get("x-test-principal") === "guest") req.guestSession = { id: "test-guest" } as NonNullable<Request["guestSession"]>; else if (req.get("x-test-principal") === "user") req.user = { id: "test-user", role: "user", status: "active" } as NonNullable<Request["user"]>; next(); });
    app.use("/api/v1", academicPresentation, summaryVisualRoutes(factory)); app.use(errorHandler);
    return { ...f, app, factory, root: `/api/v1/subjects/${f.subjectId}/mind-maps` };
  }
  it("blocks anonymous metadata and text access before source reads", async () => {
    const f = app(); for (const path of [f.root, `${f.root}/${f.lectures[0]!.id}`]) await request(f.app).get(path).expect(401);
    expect(f.factory).not.toHaveBeenCalled();
  });
  it.each(["guest", "user"])("allows a verified %s to read a published visual, privately and without writes", async principal => {
    const f = app(), response = await request(f.app).get(`${f.root}/${f.lectures[0]!.id}`).set("x-test-principal", principal).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store"); expect(response.body.data.sections[0].points[0].evidence[0].quote).toBe(summaries[0]!.sections[0]!.points[0]!.evidence[0]);
    expect(JSON.stringify(response.body)).not.toMatch(/storage_key|answer_key|correctIndex|signedUrl|access_token/u);
    await request(f.app).post(f.root).set("x-test-principal", principal).expect(404);
  });
  it("validates UUIDs and rejects cross-subject identifiers", async () => {
    const f = app(); await request(f.app).get(`${f.root}/bad-id`).set("x-test-principal", "user").expect(400);
    await request(f.app).get(`${f.root}/${finquizRecordId("lecture:rm-l1")}`).set("x-test-principal", "guest").expect(404);
    expect(f.files.read).not.toHaveBeenCalled();
  });
});
