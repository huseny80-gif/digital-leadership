import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HTML_RELATIVE = "exam-module.html";
const AUDIO_RELATIVE = "exam-section/audio/digital-leadership-summary.mp3";
const TRANSCRIPT_RELATIVE = "exam-section/audio/digital-leadership-summary.txt";
const FILES = [HTML_RELATIVE, AUDIO_RELATIVE, TRANSCRIPT_RELATIVE];

function attributeValue(tag, attribute) {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*[\\\"']([^\\\"']+)[\\\"']`, "i"));
  return match?.[1] ?? null;
}

function validateHtmlAudioSource(html) {
  if ( !/<audio\b[^>]*>/i.test(html)) {
    throw new Error("exam-module.html must contain an audio element");
  }
  const sourceTags = [...html.matchAll(/<source\b[^>]*>/gi)].map((match) => match[0]);
  const source = sourceTags.find((tag) => attributeValue(tag, "src") === AUDIO_RELATIVE);
  if (!source) {
    throw new Error(`exam-module.html must reference audio source ${AUDIO_RELATIVE}`);
  }
  if (attributeValue(source, "type") !== "audio/mpeg") {
    throw new Error(`exam-module.html audio source must use type audio/mpeg for ${AUDIO_RELATIVE}`);
  }
}

async function requiredFile(path, label) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a regular file");
    return await readFile(path);
  } catch (error) {
    throw new Error(`Missing required ${label}: ${path}`, { cause: error });
  }
}

async function sameBytes(path, expected) {
  try {
    const actual = await readFile(path);
    return actual.equals(expected);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Validate and synchronize the canonical root exam assets into web/public.
 * @param {string} repositoryRoot Absolute or relative repository root.
 * @param {{check?: boolean}} [options]
 * @returns {Promise<{check: boolean, changed: boolean, files: string[], stale: string[]}>}
 */
export async function syncExamAudio(repositoryRoot, options = {}) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) {
    throw new TypeError("repositoryRoot must be a non-empty path");
  }
  const root = resolve(repositoryRoot);
  const check = options.check === true;
  const sources = {
    [HTML_RELATIVE]: join(root, HTML_RELATIVE),
    [AUDIO_RELATIVE]: join(root, AUDIO_RELATIVE),
    [TRANSCRIPT_RELATIVE]: join(root, TRANSCRIPT_RELATIVE),
  };
  const targets = {
    [HTML_RELATIVE]: join(root, "web", "public", HTML_RELATIVE),
    [AUDIO_RELATIVE]: join(root, "web", "public", AUDIO_RELATIVE),
    [TRANSCRIPT_RELATIVE]: join(root, "web", "public", TRANSCRIPT_RELATIVE),
  };

  const contents = {};
  for (const relativePath of FILES) {
    contents[relativePath] = await requiredFile(sources[relativePath], relativePath);
  }
  validateHtmlAudioSource(contents[HTML_RELATIVE].toString("utf8"));

  const stale = [];
  for (const relativePath of FILES) {
    if (!(await sameBytes(targets[relativePath], contents[relativePath]))) stale.push(relativePath);
  }

  if (check) {
    if (stale.length > 0) {
      throw new Error(`web/public exam assets are stale or missing: ${stale.join(", ")}`);
    }
    return { check: true, changed: false, files: FILES.map((relativePath) => targets[relativePath]), stale: [] };
  }

  for (const relativePath of FILES) await mkdir(dirname(targets[relativePath]), { recursive: true });
  for (const relativePath of FILES) await copyFile(sources[relativePath], targets[relativePath]);
  return { check: false, changed: stale.length > 0, files: FILES.map((relativePath) => targets[relativePath]), stale };
}

function repositoryRootFromThisScript() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function isCliInvocation() {
  if (!process.argv[1]) return false;
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isCliInvocation()) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const unknown = args.filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    console.error(`Usage: node scripts/sync-exam-audio.mjs [--check]`);
    process.exitCode = 2;
  } else {
    syncExamAudio(repositoryRootFromThisScript(), { check })
      .then((result) => {
        console.log(check ? "Exam assets are synchronized." : `Synchronized ${result.files.length} exam assets.`);
      })
      .catch((error) => {
        console.error(`sync-exam-audio: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
