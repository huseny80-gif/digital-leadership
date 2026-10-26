#!/usr/bin/env node
// Re-checks an already registered lecture: its summary, cases and reading against its transcript.
// usage: verify_evidence.mjs --subject <slug> --number <n> [--root <catalog dir>] [--match-reading yes]
// Reading passages are matched against the transcript only with --match-reading yes (right for a proofread
// visual transcription; lectures 1–6 were read from the PDF pages, so their passages are not in the transcript).
import { checkCases, checkReading, checkSummary, defaultRoot, parseArgs, readJson, report } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2)), root = args.root ?? defaultRoot, number = Number(args.number);
if (!args.subject || !number) { console.error("usage: verify_evidence.mjs --subject <slug> --number <n> [--root dir]"); process.exit(2); }
const catalog = readJson(root, "catalog.json");
const lecture = catalog.subjects.find(item => item.id === args.subject)?.lectures.find(item => item.number === number);
if (!lecture) { console.error("no such lecture in the catalog"); process.exit(2); }
const asset = Object.values(catalog.assets).find(item => item.path === lecture.files?.[0]?.url);
const source = readJson(root, "extractedSources.json").sources.find(item => item.sha256 === asset?.sha256);
if (!source) { console.error("the lecture's PDF has no transcript in extractedSources.json"); process.exit(1); }
const summary = readJson(root, "academicSummaries.json").summaries.find(item => item.lectureId === lecture.id);
const cases = readJson(root, "analyticalCases.json").cases.filter(item => item.sha256 === source.sha256);
const reading = args.subject === "legal-regulatory" ? readJson(root, "legalAcademicReadings.json").sources.find(item => item.sha256 === source.sha256) : undefined;
const results = [summary ? checkSummary(summary, source.text) : { errors: ["no academic summary registered"], warnings: [] }, checkCases(cases, source.text)];
if (args.subject === "legal-regulatory") results.push(reading ? checkReading(reading, source.text, { matchTranscript: args["match-reading"] === "yes" }) : { errors: ["no legal reading registered"], warnings: [] });
const failures = report(results);
console.log(`${lecture.id}: summary ${summary ? "yes" : "NO"}, ${cases.length} cases${reading ? ", reading yes" : ""} — ${failures ? failures + " problems" : "all evidence found in the transcript"}`);
process.exit(failures ? 1 : 0);
