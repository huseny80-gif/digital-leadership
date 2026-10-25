import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const defaultRoot = fileURLToPath(new URL("../../../../backend/content/finquiz/", import.meta.url));
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const readJson = (root, name) => JSON.parse(readFileSync(join(root, name), "utf8"));
export const writeJson = (root, name, value) => writeFileSync(join(root, name), JSON.stringify(value, null, 2) + "\n");

/** Same normalization as backend/src/finquiz/academicSummaries.ts `comparable`:
 * the backend accepts evidence only if it matches the transcript this way. */
export const comparable = text => text.normalize("NFKC").replace(/[ً-ٰٟـ‌-‏‪-‮⁦-⁩]/gu, "").replace(/[()]/gu, "").replace(/\s+/gu, " ").trim();
const relaxed = text => comparable(text).replace(/[«»]/gu, "");

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1]; i++;
  }
  return args;
}

/** Returns { errors, warnings }. Each needle must occur in the transcript. */
export function checkEvidence(transcript, label, needles) {
  const strict = comparable(transcript), loose = relaxed(transcript), errors = [], warnings = [];
  for (const needle of needles) {
    if (strict.includes(comparable(needle))) continue;
    if (loose.includes(relaxed(needle))) warnings.push(`${label}: matches only after dropping «» — ${needle.slice(0, 60)}`);
    else errors.push(`${label}: not in the transcript — ${needle.slice(0, 80)}`);
  }
  return { errors, warnings };
}

export function checkSummary(summary, transcript) {
  const out = { errors: [], warnings: [] };
  if (!summary.overview || !Array.isArray(summary.sections) || !summary.sections.length) out.errors.push("summary: needs overview and sections");
  for (const section of summary.sections ?? []) for (const point of section.points ?? []) {
    if (!point.term || !point.text || !point.evidence?.length) { out.errors.push(`summary: point without term/text/evidence in «${section.heading}»`); continue; }
    const r = checkEvidence(transcript, `summary «${point.term}»`, point.evidence);
    out.errors.push(...r.errors); out.warnings.push(...r.warnings);
  }
  return out;
}

export function checkCases(cases, transcript) {
  const out = { errors: [], warnings: [] }, ids = new Set();
  for (const item of cases) {
    if (!item.id || ids.has(item.id)) out.errors.push(`case: missing or duplicate id ${item.id}`);
    ids.add(item.id);
    if (!["decision", "diagnosis", "prioritization"].includes(item.skill)) out.errors.push(`${item.id}: skill must be decision, diagnosis or prioritization`);
    if (!item.prompt || !item.criterion || !item.evidence?.length) out.errors.push(`${item.id}: needs prompt, criterion and evidence`);
    if ((item.options?.length ?? 0) < 3 || item.options.filter(option => option.isCorrect).length !== 1) out.errors.push(`${item.id}: needs 3+ options and exactly one correct`);
    const needles = [{ label: `${item.id} case`, list: item.evidence ?? [] }, ...(item.options ?? []).map((option, i) => ({ label: `${item.id} option ${i + 1}`, list: option.evidence ?? [] }))];
    for (const { label, list } of needles) { const r = checkEvidence(transcript, label, list); out.errors.push(...r.errors); out.warnings.push(...r.warnings); }
    for (const [i, option] of (item.options ?? []).entries()) if (!option.evidence?.length || !option.rationale) out.errors.push(`${item.id} option ${i + 1}: needs rationale and evidence`);
  }
  return out;
}

/** Mirrors validateReading in backend/src/examMaterials/legalAcademicReadings.ts.
 * Passages are also matched against the transcript, which holds only when the
 * transcript is a proofread visual one; lectures 1–6 were read from the PDF pages
 * themselves, so verify_evidence.mjs passes matchTranscript:false for them. */
export function checkReading(reading, transcript, { matchTranscript = true } = {}) {
  const out = { errors: [], warnings: [] }, seen = new Set(), key = text => text.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!Number.isInteger(reading.pageCount) || reading.pageCount < 1) out.errors.push("reading: pageCount must be the PDF's real page count");
  if ((reading.topics?.length ?? 0) < 4) out.errors.push("reading: needs at least 4 topics");
  for (const topic of reading.topics ?? []) {
    if (!topic.title?.trim() || !topic.passages?.length) out.errors.push(`reading: topic without title or passages`);
    for (const passage of topic.passages ?? []) {
      const text = key(passage.text ?? ""), label = `reading «${topic.title}» p.${passage.page}`;
      if (!Number.isInteger(passage.page) || passage.page < 1 || passage.page > reading.pageCount) out.errors.push(`${label}: page outside 1..${reading.pageCount}`);
      if (text.length < 25 || text.length > 1500) out.errors.push(`${label}: passage must be 25–1500 characters`);
      if (/[|¦]|(?:https?:\/\/)|[A-Za-z]{2,}|[<>]{2}/u.test(text)) out.errors.push(`${label}: no Latin words, «|», URLs or «<<» in passages — ${text.slice(0, 50)}`);
      if (seen.has(text)) out.errors.push(`${label}: duplicate passage`);
      seen.add(text);
      if (!matchTranscript) continue;
      const r = checkEvidence(transcript, label, [passage.text]); out.errors.push(...r.errors); out.warnings.push(...r.warnings);
    }
  }
  return out;
}

export function report(results) {
  const errors = results.flatMap(r => r.errors), warnings = results.flatMap(r => r.warnings);
  for (const w of warnings) console.warn("warning:", w);
  for (const e of errors) console.error("error:", e);
  return errors.length;
}
