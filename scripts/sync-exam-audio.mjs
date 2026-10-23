import { copyFile, lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXAM = "exam-module.html";
const SUMMARIES = "summaries.html";
const MANIFEST = "assets/audio/manifest.json";
const VOICES = ["msa-male", "msa-female", "iraqi-male", "iraqi-female", "saudi-male", "saudi-female"];
const AUDIO_RELATIVE = "exam-section/audio/digital-leadership-summary.mp3";
const TRANSCRIPT_RELATIVE = "exam-section/audio/digital-leadership-summary.txt";
const FILES = [EXAM, SUMMARIES, AUDIO_RELATIVE, TRANSCRIPT_RELATIVE];

async function directoryFiles(root, relative) {
  let entries;
  try { entries = await readdir(join(root, relative), { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Audio assets must not contain symlinks: ${path}`);
    if (entry.isDirectory()) files.push(...await directoryFiles(root, path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Audio asset must be a regular file: ${path}`);
  }
  return files;
}

async function validateStudyPages(root, contents) {
  const exam = contents[EXAM].toString("utf8");
  if (/<audio\b|\binitAudio\b|\bspeechSynthesis\b|id=["']audio-/i.test(exam)) {
    throw new Error("exam-module.html must not contain an audio/podcast player");
  }
  const summaries = contents[SUMMARIES].toString("utf8");
  const embedded = summaries.match(/<script type="application\/json" id="summaries-data">([\s\S]*?)<\/script>/)?.[1];
  if (!embedded || !summaries.includes('id="summaries-script"') || !summaries.includes('"audio/mpeg"')) {
    throw new Error("summaries.html must contain the lecture-linked MP3 player and summary data");
  }
  const data = JSON.parse(embedded);
  const manifest = JSON.parse(contents[MANIFEST].toString("utf8"));
  if (manifest.version !== 1 || manifest.summaryRevision !== data.revision || !Array.isArray(manifest.lectures) || !Array.isArray(data.lectures) || manifest.lectures.length !== data.lectures.length || data.lectures.length === 0) {
    throw new Error("Audio manifest must match the published summaries revision");
  }
  if (JSON.stringify(data.voices?.map(voice => voice.id)) !== JSON.stringify(VOICES)) throw new Error("Six MSA/Iraqi/Saudi male/female voice options are required");
  if (new Set(manifest.lectures.map(lecture => lecture.id)).size !== data.lectures.length) throw new Error("Audio manifest contains duplicate lectures");
  for (const lecture of data.lectures) {
    if (!/^innovation-\d{2}$/.test(lecture.id)) throw new Error("Invalid lecture asset identifier");
    const entry = manifest.lectures.find(item => item.id === lecture.id);
    const transcript = `assets/audio/${lecture.id}/summary.txt`;
    const expectedHash = createHash("sha256").update(lecture.transcript).digest("hex");
    if (!entry || entry.sourceSha256 !== lecture.sha256 || !/^[a-f0-9]{64}$/.test(lecture.sha256) || entry.summarySha256 !== expectedHash || lecture.summarySha256 !== expectedHash || entry.transcript !== transcript) {
      throw new Error(`Lecture transcript/source mismatch: ${lecture.id}`);
    }
    if (contents[transcript]?.toString("utf8") !== lecture.transcript) throw new Error(`Transcript differs from its displayed summary: ${transcript}`);
    if (!entry.recordings || Object.keys(entry.recordings).length !== VOICES.length) throw new Error(`Missing lecture voice options: ${lecture.id}`);
    for (const voice of VOICES) {
      const recording = entry.recordings[voice];
      const expectedPath = `assets/audio/${lecture.id}/${voice}.mp3`;
      if (!recording || recording.path !== expectedPath || typeof recording.available !== "boolean") throw new Error(`Invalid recording path or availability: ${lecture.id}/${voice}`);
      if (recording.available) {
        const audio = await requiredFile(join(root, expectedPath), expectedPath);
        const id3 = audio.subarray(0, 3).toString("ascii") === "ID3";
        const frame = audio.length >= 2 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0;
        if (audio.length < 128 || (!id3 && !frame)) throw new Error(`Published recording is not an MP3: ${expectedPath}`);
      }
    }
  }
}

async function requiredFile(path, label) {
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw new Error("not a regular file");
    return await readFile(path);
  } catch (error) {
    throw new Error(`Missing required ${label}: ${path}`, { cause: error });
  }
}

async function sameBytes(path, expected) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Public asset must not be a symlink: ${path}`);
    const actual = await readFile(path);
    return actual.equals(expected);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Validate and synchronize the root study pages and their assets into web/public.
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
  // Only this generated subtree may have obsolete public files removed. Never
  // remove unrelated web/public assets or the preserved general demo recording.
  const publicRoot = join(root, "web", "public");
  for (const relative of ["web", "web/public", "web/public/assets", "web/public/assets/audio", "assets", "assets/audio"]) {
    try { if ((await lstat(join(root, relative))).isSymbolicLink()) throw new Error(`Asset directory must not be a symlink: ${relative}`); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  const audioFiles = await directoryFiles(root, "assets/audio");
  const files = [...FILES, ...new Set([MANIFEST, ...audioFiles])];
  const targets = Object.fromEntries(files.map(path => [path, join(publicRoot, path)]));

  const contents = {};
  for (const relativePath of files) {
    contents[relativePath] = await requiredFile(join(root, relativePath), relativePath);
  }
  await validateStudyPages(root, contents);

  const stale = [];
  for (const relativePath of files) {
    if (!(await sameBytes(targets[relativePath], contents[relativePath]))) stale.push(relativePath);
  }

  const obsolete = (await directoryFiles(publicRoot, "assets/audio")).filter(path => !audioFiles.includes(path));
  if (check) {
    if (stale.length > 0 || obsolete.length > 0) {
      throw new Error(`web/public study assets are stale or missing: ${[...stale, ...obsolete].join(", ")}`);
    }
    return { check: true, changed: false, files: files.map(path => targets[path]), stale: [] };
  }

  for (const relativePath of files) await mkdir(dirname(targets[relativePath]), { recursive: true });
  for (const relativePath of files) await copyFile(join(root, relativePath), targets[relativePath]);
  for (const relativePath of obsolete) await rm(join(publicRoot, relativePath));
  return { check: false, changed: stale.length > 0 || obsolete.length > 0, files: files.map(path => targets[path]), stale: [...stale, ...obsolete] };
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
        console.log(check ? "Study pages and audio assets are synchronized." : `Synchronized ${result.files.length} study assets.`);
      })
      .catch((error) => {
        console.error(`sync-exam-audio: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
