import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { manifest, catalogRoot } from "../dist/finquiz/catalog.js";
import { compileCatalogStudyContent, catalogStudyPolicy } from "../dist/finquiz/catalogStudyContent.js";

// Rebuild only from approved file bytes. Lecture/download IDs, PDFs and source
// transcriptions are unchanged; no database, model or external service is used.
const sources = [];
for (const subject of manifest.subjects) for (const lecture of subject.lectures) {
  if (lecture.status !== "published") continue;
  const asset = Object.values(manifest.assets).find(asset => asset.subjectSlug === subject.id && !asset.bodyHtml && asset.filename.endsWith(".pdf") && lecture.files?.some(file => file.url === asset.path));
  if (!asset) continue;
  const content = await compileCatalogStudyContent(lecture, asset);
  sources.push({ lectureId: lecture.id, digest: createHash("sha256").update(JSON.stringify(content)).digest("hex"), content });
}
await writeFile(new URL("catalogStudyContent.json", catalogRoot), JSON.stringify({ policy: catalogStudyPolicy, sources }, null, 2) + "\n");
console.log(JSON.stringify({ sourceFiles: sources.length, reviewedAcademicPoints: sources.filter(row => row.content.summary.grounding?.summaryPolicy === "reviewed-academic-points-v1").length }));
