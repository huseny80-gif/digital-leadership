import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ACADEMIC_VOICES } from "@digital-leadership/shared";
import { synthesizeAcademicSpeech } from "../dist/examMaterials/academicSpeech.js";

// Live provider check: fixed public text only, no database or session secrets.
// Validate actual decoding rather than accepting a nonempty network response.
const directory = await mkdtemp(join(tmpdir(), "academic-speech-check-"));
try {
  for (const voice of ACADEMIC_VOICES) {
    const bytes = await synthesizeAcademicSpeech("منصة القِيادَة الرَّقْمِيَّة.\n\nمُراجَعَة أكاديمية.\n\nحَوْكَمَة المَخاطِر.", voice.id);
    const filename = join(directory, `${voice.id}.mp3`);
    await writeFile(filename, bytes);
    const media = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", filename], { encoding: "utf8", timeout: 10000 }));
    const stream = media.streams?.[0], seconds = Number(media.format?.duration);
    if (stream?.codec_name !== "mp3" || stream.sample_rate !== "24000" || stream.channels !== 1 || !Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid academic MP3");
    console.log(JSON.stringify({ voice: voice.id, ready: true, bytes: bytes.length, seconds, codec: stream.codec_name, sampleRate: stream.sample_rate }));
  }
} finally { await rm(directory, { recursive: true, force: true }); }
