import type { ExamMaterialSummary } from "@shared/index";
import { catalogStudyContent } from "../finquiz/catalogStudyContent.js";
import { manifest } from "../finquiz/catalog.js";
import { groundingVersion } from "./sourceGrounding.js";
import { reviewedLegalSummary } from "./legalAcademicReadings.js";

/** Re-read the SAME byte-bound lecture edition for old bookmarks. A changed
 * file, additional source or wrong lecture number cannot inherit a reading.
 * Saved snapshots, questions, references and grades are never rewritten. */
export async function currentAcademicReadings(input: ExamMaterialSummary): Promise<ExamMaterialSummary> {
  const summary = await reviewedLegalSummary(input);
  if (summary.grounding?.policy !== groundingVersion) return summary;
  let refreshed = 0;
  const sections = await Promise.all(summary.sections.map(async section => {
    const proofs = summary.grounding!.sources.filter(proof => proof.lectureId === section.id);
    if (new Set(proofs.map(proof => proof.sha256)).size !== 1) return section;
    const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && asset.sha256 === proofs[0]?.sha256 && asset.subjectSlug !== "legal-regulatory");
    if (!asset) return section;
    const lecture = manifest.subjects.find(subject => subject.id === asset.subjectSlug)?.lectures.find(lecture => lecture.status === "published" && lecture.number === section.number && lecture.files?.some(file => file.url === asset.path));
    if (!lecture) return section;
    const content = await catalogStudyContent(lecture, asset);
    refreshed++;
    return { ...structuredClone(content.summary.sections[0]!), id: section.id, title: section.title, number: section.number };
  }));
  return refreshed ? { ...summary, introduction: "", sections } : summary;
}
