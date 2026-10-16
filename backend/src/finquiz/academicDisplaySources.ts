import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

interface Reading { sha256: string; textSha256: string; text: string }
const data = JSON.parse(readFileSync(new URL("../../content/finquiz/academicDisplaySources.json", import.meta.url), "utf8")) as { policy: string; sources: Reading[] };
/** Alternative readings use the same checked original PDF bytes. They are
 * presentation-only: archived grading programs keep their original transcript. */
export function academicDisplaySource(extracted: { sha256: string; text: string }) {
  if (data.policy !== "verified-pdf-character-readings-v1") return extracted;
  const reading = data.sources.find(source => source.sha256 === extracted.sha256);
  if (!reading) return extracted;
  if (createHash("sha256").update(reading.text).digest("hex") !== reading.textSha256) throw new Error("academic_reading_changed");
  return { sha256: extracted.sha256, text: reading.text };
}
