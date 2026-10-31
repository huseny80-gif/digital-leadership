import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { academicAudioChapters } from "@digital-leadership/shared";
import { manifest } from "../dist/finquiz/catalog.js";
import { reviewedLegalSummary, probeLegalAcademicReadings } from "../dist/examMaterials/legalAcademicReadings.js";
import { synthesizeAcademicSpeech } from "../dist/examMaterials/academicSpeech.js";

// The actual reviewed curriculum excerpt, never a learner or assessment record.
const legal = manifest.subjects.find(subject => subject.id === "legal-regulatory");
const summary = await reviewedLegalSummary({ introduction: "", sections: legal.lectures.map(lecture => ({ id: lecture.id, title: lecture.title, number: lecture.number, text: "", keyPoints: [] })),
  grounding: { policy: "strict-file-extraction-v1", sources: legal.lectures.map(lecture => {
    const asset = Object.values(manifest.assets).find(asset => asset.path === lecture.files[0].url);
    return { lectureId: lecture.id, fileId: asset.id, filename: asset.filename, sha256: asset.sha256 };
  }) } });
const chapters = academicAudioChapters(summary), directory = await mkdtemp(join(tmpdir(), "legal-academic-audio-"));
try {
  console.log(JSON.stringify(await probeLegalAcademicReadings()));
  if (chapters.length !== legal.lectures.length) throw new Error("Incomplete legal narration");
  for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index], segment = chapter.segments.find(segment => segment.kind === "body");
    if (!segment || /CamScanner|6800568008|المسح الضوئي\s+ب|صفحات ملف PDF/u.test(segment.text)) throw new Error("Invalid legal narration text");
    const voice = index % 2 ? "ar-IQ-RanaNeural" : "ar-IQ-BasselNeural";
    const bytes = await synthesizeAcademicSpeech(segment.text, voice), file = join(directory, `${index + 1}.mp3`);
    await writeFile(file, bytes);
    const media = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate", "-of", "json", file], { encoding: "utf8", timeout: 10000 }));
    if (media.streams?.[0]?.codec_name !== "mp3" || media.streams[0].sample_rate !== "24000" || !(Number(media.format?.duration) > 0)) throw new Error("Undecodable legal podcast");
    console.log(JSON.stringify({ lecture: index + 1, voice, bytes: bytes.length, seconds: Number(media.format.duration), ready: true }));
  }
} finally { await rm(directory, { recursive: true, force: true }); }
