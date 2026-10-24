import { describe, expect, it } from "vitest";
import { catalogStudyContent, compileCatalogStudyContent } from "../../src/finquiz/catalogStudyContent.js";
import { findSourceLecture, normalizeCatalogTitle } from "../../src/finquiz/recordIdentity.js";
import { manifest } from "../../src/finquiz/catalog.js";

describe("current academic content from the approved PDFs", () => {
  for (const course of manifest.subjects) it(`covers every source-backed lecture and excludes solution appendices: ${course.id}`, async () => {
    let checked = 0;
    for (const lecture of course.lectures) {
      if (lecture.status !== "published") continue;
      const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && asset.filename.endsWith(".pdf") && lecture.files?.some(file => file.url === asset.path));
      if (!asset) continue;
      const content = await catalogStudyContent(lecture, asset);
      expect(content).toEqual(await compileCatalogStudyContent(lecture, asset));
      expect(content.sha256).toBe(asset.sha256);
      expect(content.paragraphCount).toBeGreaterThan(0);
      expect(content.summary.grounding!.sources).toEqual([{ lectureId: lecture.id, fileId: asset.id, filename: asset.filename, sha256: asset.sha256 }]);
      expect(content.summaryHtml).not.toMatch(/<script|<style|\son\w+=|اختبار ذاتي موثّق|عدد الأسئلة|تم المسح الضوئي|CamScanner/u);
      expect(content.lectureHtml + content.summaryHtml).not.toMatch(/األ|اإل|اآل/u);
      expect(content.summaryHtml).toContain("المصدر:");
      expect(content.summary.sections[0]!.text.length).toBeGreaterThan(100);
      if (course.id === "legal-regulatory") {
        expect(content.summary.grounding!.summaryPolicy).toBe("visually-verified-legal-excerpts-v1");
        expect(content.lectureHtml).toContain("قراءة أكاديمية موثّقة");
        expect(content.lectureHtml).toContain("الصفحات ");
        expect(content.lectureHtml).not.toMatch(/العرض الأكاديمي للمحاضرة|الأسطر|\b(?:BEST|Fr|SH|Cel|Hv|Jie)\b|CamScanner|6800568008/u);
        for (const topic of content.summary.sections[0]!.topics!) expect(content.lectureHtml).toContain(topic.text.split("\n\n")[0]!.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
      }
      checked++;
    }
    expect(checked).toBe({ "ai-data": 6, "legal-regulatory": 7, "cybersecurity-governance": 6, "innovation-project-management": 5, "risk-management": 3 }[course.id]);
  }, 30000);
  it("rejects a changed original instead of recycling its earlier summary", async () => {
    const lecture = manifest.subjects[0]!.lectures[0]!;
    const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && lecture.files?.some(file => file.url === asset.path) && asset.filename.endsWith(".pdf"))!;
    await expect(catalogStudyContent(lecture, { ...asset, sha256: "0".repeat(64) })).rejects.toThrow("catalog_study_source_changed");
  });
  it("retains a permanent source binding after an instructor renames the lecture", () => {
    const source = { id: "cs-iso-roadmap", title: "خارطة الطريق للحصول على الشهادة الدولية ISO 27001" };
    const renamed = { id: "original-live-id", title: "عنوان اختاره المدرب", catalogSourceId: source.id };
    expect(findSourceLecture(source, [renamed])).toBe(renamed);
    expect(normalizeCatalogTitle(source.title + "\u2069")).toBe(normalizeCatalogTitle(source.title));
    expect(findSourceLecture(source, [{ id: "legacy", title: source.title + "\u2069" }])!.id).toBe("legacy");
  });
});
