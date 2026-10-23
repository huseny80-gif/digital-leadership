import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { syncExamAudio } from "./sync-exam-audio.mjs";

const AUDIO = "exam-section/audio/digital-leadership-summary.mp3";
const TRANSCRIPT = "exam-section/audio/digital-leadership-summary.txt";
const HTML = "exam-module.html";
const HTML_TEMPLATE = `<!doctype html><html lang="ar" dir="rtl"><body><audio controls preload="metadata"><source src="${AUDIO}" type="audio/mpeg"></audio></body></html>`;

async function fixture({ html = HTML_TEMPLATE, audio = Buffer.from("fixture-mp3-bytes"), transcript = "نص تجريبي" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "digital-leadership-sync-"));
  await mkdir(join(root, "exam-section", "audio"), { recursive: true });
  await writeFile(join(root, HTML), html);
  if (audio !== null) await writeFile(join(root, AUDIO), audio);
  await writeFile(join(root, TRANSCRIPT), transcript);
  return root;
}

async function cleanup(root) {
  await rm(root, { recursive: true, force: true });
}

async function target(root, relativePath) {
  return readFile(join(root, "web", "public", relativePath));
}

test("fails when a required canonical source is absent", async () => {
  const root = await fixture({ audio: null });
  try {
    await assert.rejects(() => syncExamAudio(root), /Missing required exam-section\/audio\/digital-leadership-summary\.mp3/);
  } finally {
    await cleanup(root);
  }
});

test("synchronizes HTML, MP3 bytes, and transcript", async () => {
  const root = await fixture();
  try {
    const result = await syncExamAudio(root);
    assert.equal(result.files.length, 3);
    assert.deepEqual([...result.stale].sort(), [HTML, AUDIO, TRANSCRIPT].sort());
    assert.deepEqual(await target(root, HTML), await readFile(join(root, HTML)));
    assert.deepEqual(await target(root, AUDIO), await readFile(join(root, AUDIO)));
    assert.deepEqual(await target(root, TRANSCRIPT), await readFile(join(root, TRANSCRIPT)));
  } finally {
    await cleanup(root);
  }
});

test("copies audio as byte-identical data", async () => {
  const audio = Buffer.from([0, 1, 2, 3, 255, 254]);
  const root = await fixture({ audio });
  try {
    await syncExamAudio(root);
    assert.deepEqual(await target(root, AUDIO), audio);
  } finally {
    await cleanup(root);
  }
});

test("--check rejects stale or missing targets without writing", async () => {
  const root = await fixture();
  try {
    await assert.rejects(() => syncExamAudio(root, { check: true }), /stale or missing/);
    const publicDirExists = await readFile(join(root, "web", "public", HTML)).then(() => true, () => false);
    assert.equal(publicDirExists, false);
  } finally {
    await cleanup(root);
  }
});

test("--check succeeds after a complete synchronization", async () => {
  const root = await fixture();
  try {
    await syncExamAudio(root);
    const result = await syncExamAudio(root, { check: true });
    assert.equal(result.check, true);
    assert.equal(result.changed, false);
    assert.deepEqual(result.stale, []);
  } finally {
    await cleanup(root);
  }
});

test("--check rejects a stale target after canonical content changes", async () => {
  const root = await fixture();
  try {
    await syncExamAudio(root);
    await writeFile(join(root, TRANSCRIPT), "نص محدث");
    await assert.rejects(() => syncExamAudio(root, { check: true }), /digital-leadership-summary\.txt/);
  } finally {
    await cleanup(root);
  }
});

test("rejects an invalid or mismatched HTML audio source", async () => {
  const root = await fixture({ html: HTML_TEMPLATE.replace(AUDIO, "exam-section/audio/other.mp3") });
  try {
    await assert.rejects(() => syncExamAudio(root), /must reference audio source/);
  } finally {
    await cleanup(root);
  }
});

test("rejects a mismatched MIME type for the canonical audio source", async () => {
  const root = await fixture({ html: HTML_TEMPLATE.replace("audio/mpeg", "audio/wav") });
  try {
    await assert.rejects(() => syncExamAudio(root), /must use type audio\/mpeg/);
  } finally {
    await cleanup(root);
  }
});
