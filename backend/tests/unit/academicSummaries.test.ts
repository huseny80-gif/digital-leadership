import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogRoot } from "../../src/finquiz/catalog.js";
import { academicSummaryHtml, unsupportedEvidence, type AcademicSummary } from "../../src/finquiz/academicSummaries.js";

const data = JSON.parse(readFileSync(new URL("academicSummaries.json", catalogRoot), "utf8")) as { summaries: AcademicSummary[] };
const sources = JSON.parse(readFileSync(new URL("extractedSources.json", catalogRoot), "utf8")) as { sources: Array<{ sha256: string; text: string }> };

describe("evidence-bound academic summaries", () => {
  for (const summary of data.summaries) it(`grounds every point of ${summary.lectureId} in its own file`, () => {
    const source = sources.sources.find(item => item.sha256 === summary.sha256);
    expect(source).toBeDefined();
    expect(unsupportedEvidence(summary, source!.text)).toEqual([]);
    expect(summary.sections.every(section => section.points.length && section.points.every(point => point.evidence.length && point.text.length > 30))).toBe(true);
    expect(academicSummaryHtml("محاضرة", "file.pdf", summary, source!.text)).toContain("<strong>");
  });
  it("refuses to render a point whose evidence is not in the file", () => {
    const summary = data.summaries[0]!;
    expect(() => academicSummaryHtml("محاضرة", "file.pdf", summary, "نص مختلف تمامًا")).toThrow(/academic_summary_unsupported/);
  });
});
