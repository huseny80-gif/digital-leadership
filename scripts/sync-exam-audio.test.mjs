import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { syncExamAudio } from "./sync-exam-audio.mjs";

const AUDIO = "exam-section/audio/digital-leadership-summary.mp3";
const TRANSCRIPT = "exam-section/audio/digital-leadership-summary.txt";
const MANIFEST = "assets/audio/manifest.json";
const LECTURE_TRANSCRIPT = "assets/audio/innovation-01/summary.txt";
const MP3 = "assets/audio/innovation-01/msa-male.mp3";
const VOICES = ["msa-male", "msa-female", "iraqi-male", "iraqi-female", "saudi-male", "saudi-female"];
const TEXT = "ملخص تجريبي لا يُنشر في المنصة.\n";
const DIALECT_TEXT = "هذا نص تجريبي باللهجة العراقية.\n";
const HASH = createHash("sha256").update(TEXT).digest("hex");
const VALID_MP3_HEADER = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200)]);

async function write(root, relative, value) {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), value);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "digital-leadership-study-sync-"));
  const lecture = { id: "innovation-01", sha256: "a".repeat(64), summarySha256: HASH, transcript: TEXT };
  const data = { revision: "test-version", voices: VOICES.map(id => ({ id })), lectures: [lecture] };
  const manifest = { version: 1, summaryRevision: data.revision, lectures: [{
    id: lecture.id, sourceSha256: lecture.sha256, summarySha256: HASH, transcript: LECTURE_TRANSCRIPT,
    recordings: Object.fromEntries(VOICES.map(voice => [voice, { path: `assets/audio/innovation-01/${voice}.mp3`, available: false }])),
  }] };
  await write(root, "exam-module.html", '<!doctype html><html lang="ar" dir="rtl"><a href="summaries.html">الملخصات</a></html>');
  await write(root, "summaries.html", `<html lang="ar" dir="rtl"><script type="application/json" id="summaries-data">${JSON.stringify(data)}</script><script id="summaries-script">const mime = "audio/mpeg";</script></html>`);
  await write(root, MANIFEST, JSON.stringify(manifest));
  await write(root, LECTURE_TRANSCRIPT, TEXT);
  await write(root, AUDIO, VALID_MP3_HEADER);
  await write(root, TRANSCRIPT, "تجربة عامة مستقلة");
  return root;
}
async function updateManifest(root, change) {
  const manifest = JSON.parse(await readFile(join(root, MANIFEST), "utf8"));
  change(manifest);
  await write(root, MANIFEST, JSON.stringify(manifest));
}
async function addNewRecordingMetadata(root, voice = VOICES[0], overrides = {}) {
  const dialect = voice.slice(0, voice.lastIndexOf("-"));
  const audio = Buffer.from(VALID_MP3_HEADER);
  await write(root, `assets/audio/innovation-01/${dialect}.txt`, DIALECT_TEXT);
  await write(root, MP3, audio);
  await updateManifest(root, value => {
    Object.assign(value.lectures[0].recordings[voice], {
      available: true,
      transcript: `assets/audio/innovation-01/${dialect}.txt`,
      transcriptSha256: createHash("sha256").update(DIALECT_TEXT).digest("hex"),
      sha256: createHash("sha256").update(audio).digest("hex"),
      bytes: audio.length,
      durationSeconds: 12.5,
      provider: "edge-tts",
      voiceId: "ar-SY-LaithNeural",
      generatedAt: "2026-10-24T00:00:00.000Z",
      sourceSummarySha256: HASH,
      ...overrides,
    });
  });
}
async function usingFixture(run) {
  const root = await fixture();
  try { await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("copies both pages, manifests and transcripts without requiring pending MP3s", () => usingFixture(async root => {
  const result = await syncExamAudio(root);
  assert.equal(result.files.length, 6);
  for (const path of ["exam-module.html", "summaries.html", MANIFEST, LECTURE_TRANSCRIPT, AUDIO, TRANSCRIPT]) {
    assert.deepEqual(await readFile(join(root, "web/public", path)), await readFile(join(root, path)));
  }
  await assert.rejects(readFile(join(root, "web/public", MP3)), /ENOENT/);
}));

test("fails before writing when a canonical page or manifest is missing", () => usingFixture(async root => {
  await rm(join(root, "summaries.html"));
  await assert.rejects(syncExamAudio(root), /Missing required summaries.html/);
  await assert.rejects(readFile(join(root, "web/public/exam-module.html")), /ENOENT/);
}));

test("rejects an audio player left in the exam page", () => usingFixture(async root => {
  await write(root, "exam-module.html", "<audio controls></audio>");
  await assert.rejects(syncExamAudio(root), /must not contain an audio/);
}));

test("rejects source or summary version drift", () => usingFixture(async root => {
  await updateManifest(root, value => { value.summaryRevision = "old"; });
  await assert.rejects(syncExamAudio(root), /published summaries revision/);
}));

test("rejects transcript text that differs from the displayed summary", () => usingFixture(async root => {
  await write(root, LECTURE_TRANSCRIPT, "نص محاضرة أخرى");
  await assert.rejects(syncExamAudio(root), /Transcript differs/);
}));

test("rejects cross-lecture, external and traversal recording paths", () => usingFixture(async root => {
  for (const path of ["https://example.com/audio.mp3", "assets/audio/innovation-02/msa-male.mp3", "assets/audio/innovation-01/../../other.mp3"]) {
    await updateManifest(root, value => { value.lectures[0].recordings[VOICES[0]].path = path; });
    await assert.rejects(syncExamAudio(root), /Invalid recording path/);
  }
}));

test("requires all six voice mappings", () => usingFixture(async root => {
  await updateManifest(root, value => { delete value.lectures[0].recordings[VOICES[5]]; });
  await assert.rejects(syncExamAudio(root), /Missing lecture voice options/);
}));

test("does not publish an available flag without an actual MP3", () => usingFixture(async root => {
  await updateManifest(root, value => { value.lectures[0].recordings[VOICES[0]].available = true; });
  await assert.rejects(syncExamAudio(root), /Missing required assets\/audio\/innovation-01\/msa-male.mp3/);
  await write(root, MP3, "<html>not an MP3</html>");
  await assert.rejects(syncExamAudio(root), /not an MP3/);
}));

test("copies an available lecture MP3 byte for byte", () => usingFixture(async root => {
  await updateManifest(root, value => { value.lectures[0].recordings[VOICES[0]].available = true; });
  await write(root, MP3, VALID_MP3_HEADER);
  await syncExamAudio(root);
  assert.deepEqual(await readFile(join(root, "web/public", MP3)), VALID_MP3_HEADER);
}));

test("rejects MP3 corruption against the declared audio hash and byte count", () => usingFixture(async root => {
  await addNewRecordingMetadata(root);
  const corrupted = Buffer.from(VALID_MP3_HEADER);
  corrupted[20] ^= 1;
  await write(root, MP3, corrupted);
  await assert.rejects(syncExamAudio(root), /Recording audio hash mismatch/);
}));

test("rejects a dialect transcript path that does not match the selected voice prefix", () => usingFixture(async root => {
  await addNewRecordingMetadata(root, "msa-male", { transcript: "assets/audio/innovation-01/iraqi.txt" });
  await assert.rejects(syncExamAudio(root), /Invalid recording transcript path/);
}));

test("rejects a stale source summary hash on a generated recording", () => usingFixture(async root => {
  await addNewRecordingMetadata(root, "msa-male", { sourceSummarySha256: "f".repeat(64) });
  await assert.rejects(syncExamAudio(root), /Recording source summary mismatch/);
}));

test("accepts the real provider voice id and rejects a dropdown key as identity", () => usingFixture(async root => {
  await addNewRecordingMetadata(root);
  await syncExamAudio(root);
  await updateManifest(root, value => { value.lectures[0].recordings["msa-male"].voiceId = "msa-male"; });
  await assert.rejects(syncExamAudio(root), /Invalid recording voice id/);
}));

test("--check rejects missing public targets without writing", () => usingFixture(async root => {
  await assert.rejects(syncExamAudio(root, { check: true }), /stale or missing/);
  await assert.rejects(readFile(join(root, "web/public/exam-module.html")), /ENOENT/);
}));

test("--check passes after synchronization, then detects transcript drift", () => usingFixture(async root => {
  await syncExamAudio(root);
  const result = await syncExamAudio(root, { check: true });
  assert.equal(result.changed, false);
  await write(root, "web/public/" + LECTURE_TRANSCRIPT, "قديم");
  await assert.rejects(syncExamAudio(root, { check: true }), /summary.txt/);
}));

test("removes obsolete generated audio copies without deleting unrelated public files", () => usingFixture(async root => {
  await syncExamAudio(root);
  await write(root, "web/public/assets/audio/obsolete.mp3", VALID_MP3_HEADER);
  await write(root, "web/public/unrelated.txt", "keep");
  await assert.rejects(syncExamAudio(root, { check: true }), /obsolete.mp3/);
  await syncExamAudio(root);
  await assert.rejects(readFile(join(root, "web/public/assets/audio/obsolete.mp3")), /ENOENT/);
  assert.equal(await readFile(join(root, "web/public/unrelated.txt"), "utf8"), "keep");
  assert.deepEqual(await readFile(join(root, "web/public", AUDIO)), VALID_MP3_HEADER);
}));

test("rejects symlink assets rather than following them outside the source tree", () => usingFixture(async root => {
  await symlink(join(root, "exam-module.html"), join(root, MP3));
  await assert.rejects(syncExamAudio(root), /must not contain symlinks/);
}));

test("rejects symlink public targets rather than overwriting their destinations", () => usingFixture(async root => {
  await syncExamAudio(root);
  const target = join(root, "web/public/exam-module.html");
  await rm(target);
  await symlink(join(root, "summaries.html"), target);
  await assert.rejects(syncExamAudio(root), /must not be a symlink/);
}));

async function addSubjects(root) {
  const html = await readFile(join(root, "summaries.html"), "utf8");
  const data = JSON.parse(html.match(/id="summaries-data">([\s\S]*?)<\/script>/)[1]);
  const manifest = JSON.parse(await readFile(join(root, MANIFEST), "utf8"));
  const subjects = [
    { id: "2d6c0980-e4d2-4687-9027-cf090b3d1a67", slug: "ai-data", title: "الذكاء الاصطناعي" },
    { id: "7eb2b714-570f-4ed0-a00e-10efec7a20e5", slug: "innovation-project-management", title: "الابتكار" },
  ];
  data.subjects = subjects;
  data.defaultSubjectId = subjects[1].id;
  Object.assign(data.lectures[0], { subjectId: subjects[1].id, subjectSlug: subjects[1].slug, catalogLectureId: "ip-l1" });
  Object.assign(manifest, { subjects, defaultSubjectId: data.defaultSubjectId });
  Object.assign(manifest.lectures[0], { subjectId: subjects[1].id, subjectSlug: subjects[1].slug, catalogLectureId: "ip-l1" });
  data.lectures.push({ ...data.lectures[0], id: "ai-l1", subjectId: subjects[0].id, subjectSlug: subjects[0].slug, catalogLectureId: "ai-l1" });
  manifest.lectures.push({ ...manifest.lectures[0], id: "ai-l1", subjectId: subjects[0].id, subjectSlug: subjects[0].slug,
    catalogLectureId: "ai-l1", transcript: "assets/audio/ai-l1/summary.txt",
    recordings: Object.fromEntries(VOICES.map(voice => [voice, { path: `assets/audio/ai-l1/${voice}.mp3`, available: false }])) });
  await write(root, "assets/audio/ai-l1/summary.txt", TEXT);
  await write(root, "summaries.html", html.replace(/(<script type="application\/json" id="summaries-data">)[\s\S]*?(<\/script>)/, (_, start, end) => start + JSON.stringify(data) + end));
  await write(root, MANIFEST, JSON.stringify(manifest));
}

test("accepts multiple published subjects with safe non-innovation lecture IDs", () => usingFixture(async root => {
  await addSubjects(root);
  await syncExamAudio(root);
  await syncExamAudio(root, { check: true });
  assert.equal(await readFile(join(root, "web/public/assets/audio/ai-l1/summary.txt"), "utf8"), TEXT);
}));

test("rejects a lecture assigned to a different subject in the audio manifest", () => usingFixture(async root => {
  await addSubjects(root);
  await updateManifest(root, manifest => { manifest.lectures[1].subjectId = manifest.subjects[1].id; });
  await assert.rejects(syncExamAudio(root), /Lecture subject mismatch/);
}));

test("rejects changed course metadata and default selection", () => usingFixture(async root => {
  await addSubjects(root);
  await updateManifest(root, manifest => { manifest.defaultSubjectId = "not-a-course"; });
  await assert.rejects(syncExamAudio(root), /subject metadata must match/);
}));
