#!/usr/bin/env node
// Registers one lecture across the catalog files. Checks every quotation against
// the transcript first and writes nothing unless all of it passes. Safe to re-run.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkCases, checkReading, checkSummary, defaultRoot, parseArgs, readJson, report, sha256, writeJson } from "./lib.mjs";

const usage = `usage: register_lecture.mjs --subject <slug> --number <n> --title <title> --pdf <file.pdf> --transcript <file.txt>
  --description <text> --summary <summary.json> [--cases <cases.json>] [--reading <reading.json>]
  [--id <lectureId>] [--date <yyyymmdd>] [--method <name>] [--root <catalog dir>]`;
let args;
try { args = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message + "\n" + usage); process.exit(2); }
for (const name of ["subject", "number", "title", "pdf", "transcript", "description", "summary"]) if (!args[name]) { console.error(`missing --${name}\n${usage}`); process.exit(2); }

const root = args.root ?? defaultRoot, number = Number(args.number);
if (!Number.isInteger(number) || number < 1) { console.error("--number must be a positive integer"); process.exit(2); }
const pdf = readFileSync(args.pdf), transcript = readFileSync(args.transcript, "utf8").trim() + "\n";
if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) { console.error("--pdf is not a PDF"); process.exit(2); }
if (pdf.length > 20 * 1024 * 1024) { console.error("PDF is over 20 MB; the platform refuses larger source files"); process.exit(2); }
if (transcript.length < 200) { console.error("transcript is too short to be a lecture"); process.exit(2); }

const catalog = readJson(root, "catalog.json");
const subject = catalog.subjects.find(item => item.id === args.subject);
if (!subject) { console.error(`unknown subject «${args.subject}»; known: ${catalog.subjects.map(item => item.id).join(", ")}`); process.exit(2); }
const prefix = subject.lectures.map(lecture => /^(.+)-l\d+$/.exec(lecture.id)?.[1]).find(Boolean);
const id = args.id ?? (prefix ? `${prefix}-l${number}` : undefined);
if (!id) { console.error("cannot derive the lecture id; pass --id"); process.exit(2); }
const clash = subject.lectures.find(lecture => lecture.number === number && lecture.id !== id);
if (clash) { console.error(`lecture number ${number} already belongs to ${clash.id}; pick another number or pass its --id`); process.exit(2); }

const summaryInput = JSON.parse(readFileSync(args.summary, "utf8"));
const cases = args.cases ? JSON.parse(readFileSync(args.cases, "utf8")) : [];
const reading = args.reading ? JSON.parse(readFileSync(args.reading, "utf8")) : undefined;
if (reading && args.subject !== "legal-regulatory") { console.error("--reading applies only to legal-regulatory"); process.exit(2); }

const checks = [checkSummary(summaryInput, transcript), checkCases(cases, transcript)];
if (reading) checks.push(checkReading(reading, transcript));
if (report(checks)) { console.error("nothing was written"); process.exit(1); }

const hash = sha256(pdf), filename = `${args.title}.pdf`, relative = `files/${args.subject}/${filename}`;
const assetId = sha256(relative).slice(0, 24), date = args.date ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
mkdirSync(dirname(join(root, relative)), { recursive: true });
copyFileSync(args.pdf, join(root, relative));

catalog.assets[assetId] = { id: assetId, subjectSlug: args.subject, path: relative, filename, sizeBytes: pdf.length, sha256: hash };
subject.lectures = subject.lectures.filter(lecture => lecture.id !== id);
subject.lectures.push({ id, status: "published", number, title: args.title, files: [{ type: "pdf", label: filename, url: relative }], description: args.description });
subject.summaries = subject.summaries.filter(summary => summary.lectureId !== id);
subject.summaries.push({ id: `source-summary-${date}-${id}`, lectureId: id, title: `ملخص ${args.title}`, status: "published",
  body: [args.description, ...summaryInput.sections.flatMap(section => section.points.map(point => point.text))].join("\n\n"), files: [] });
catalog.counts.lectures = catalog.subjects.reduce((n, item) => n + item.lectures.length, 0);
catalog.counts.summaries = catalog.subjects.reduce((n, item) => n + item.summaries.length, 0);
writeJson(root, "catalog.json", catalog);

const extracted = readJson(root, "extractedSources.json");
extracted.sources = extracted.sources.filter(source => source.sha256 !== hash);
extracted.sources.push({ sha256: hash, textSha256: sha256(transcript), text: transcript, method: args.method ?? "visual-transcription-v1" });
writeJson(root, "extractedSources.json", extracted);

const summaries = readJson(root, "academicSummaries.json");
summaries.summaries = summaries.summaries.filter(summary => summary.lectureId !== id && summary.sha256 !== hash);
summaries.summaries.push({ lectureId: id, sha256: hash, overview: summaryInput.overview, sections: summaryInput.sections });
// The file is kept sorted by lecture id, so a new lecture lands next to its siblings.
summaries.summaries.sort((a, b) => (a.lectureId < b.lectureId ? -1 : a.lectureId > b.lectureId ? 1 : 0));
writeJson(root, "academicSummaries.json", summaries);

if (cases.length) {
  const store = readJson(root, "analyticalCases.json");
  const ids = new Set(cases.map(item => item.id));
  store.cases = store.cases.filter(item => !ids.has(item.id) && item.sha256 !== hash).concat(cases.map(({ id: caseId, sha256: _ignored, ...rest }) => ({ id: caseId, sha256: hash, ...rest })));
  writeJson(root, "analyticalCases.json", store);
}
if (reading) {
  const store = readJson(root, "legalAcademicReadings.json");
  store.sources = store.sources.filter(item => item.sha256 !== hash && item.lectureNumber !== number);
  store.sources.push({ lectureNumber: number, filename, sha256: hash, pageCount: reading.pageCount, topics: reading.topics });
  writeJson(root, "legalAcademicReadings.json", store);
}

console.log(JSON.stringify({ lectureId: id, assetId, sha256: hash, file: relative, cases: cases.length, reading: Boolean(reading), counts: catalog.counts }, null, 2));
console.log("next: cd backend && npm run build && node scripts/buildCatalogStudyContent.mjs, then update code limits and test counts (see SKILL.md)");
