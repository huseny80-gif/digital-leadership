// Review aid: prints the Saudi narration script for every published lecture and
// the counts a reviewer should check. Mirrors studyNarrationPlan's transcript
// (title, overview, section heading and "term: text" lines). Reads only; writes
// nothing. Usage: node scripts/previewSaudiNarration.mjs [out.txt]
import { writeFileSync } from "node:fs";
import { manifest } from "../dist/finquiz/catalog.js";
import { prepareAcademicSpeech, saudiVoiceScript } from "@digital-leadership/shared";
import { readFileSync } from "node:fs";

const summaries = JSON.parse(readFileSync(new URL("../content/finquiz/academicSummaries.json", import.meta.url), "utf8")).summaries;
const total = { lectures: 0, numbers: 0, latin: 0, splits: 0, overlong: 0, dialect: 0, dropped: 0, digitsLeft: 0, latinLeft: 0 };
const out = [];
for (const course of manifest.subjects) for (const lecture of course.lectures) {
  const summary = summaries.find(item => item.lectureId === lecture.id);
  if (!summary) continue;
  const lines = [[`خلّونا نشوف ملخص ${lecture.title}.`], [summary.overview], ...summary.sections.map(section => [section.heading, ...section.points.map(point => `${point.term}: ${point.text}`)])];
  const stats = { numbers: 0, latin: 0, splits: 0, overlong: 0, dialect: 0, dropped: 0 };
  const text = lines.map(block => block.map(line => {
    const result = saudiVoiceScript(line);
    for (const key of Object.keys(stats)) stats[key] += result.stats[key];
    const spoken = prepareAcademicSpeech(result.text);
    return spoken && !/[.!?؟؛:]$/.test(spoken) ? `${spoken}.` : spoken;
  }).join("\n")).join("\n\n");
  const digitsLeft = (text.match(/\d/g) ?? []).length, latinLeft = (text.match(/[A-Za-z]{2,}/g) ?? []).length;
  out.push(`######## ${course.id} / ${lecture.id} / ${lecture.title}\n[numbers=${stats.numbers} latin=${stats.latin} splits=${stats.splits} overlong=${stats.overlong} dialect=${stats.dialect} dropped=${stats.dropped} digitsLeft=${digitsLeft} latinLeft=${latinLeft}]\n\n${text}\n`);
  total.lectures++; for (const key of Object.keys(stats)) total[key] += stats[key]; total.digitsLeft += digitsLeft; total.latinLeft += latinLeft;
}
const report = out.join("\n");
if (process.argv[2]) writeFileSync(process.argv[2], report);
console.log(JSON.stringify(total));
