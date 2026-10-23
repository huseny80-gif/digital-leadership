#!/usr/bin/env python3
"""Generate six real neural MP3 variants per approved lecture, then publish metadata.

Run in the optional Python environment from requirements-exam-audio.txt.
Needs ffmpeg and ffprobe. No Git operations or background scheduling.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

VOICES = {
    "msa-male": ("msa", "ar-SY-LaithNeural"),
    "msa-female": ("msa", "ar-SY-AmanyNeural"),
    "iraqi-male": ("iraqi", "ar-IQ-BasselNeural"),
    "iraqi-female": ("iraqi", "ar-IQ-RanaNeural"),
    "saudi-male": ("saudi", "ar-SA-HamedNeural"),
    "saudi-female": ("saudi", "ar-SA-ZariyahNeural"),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


async def command(*args):
    process = await asyncio.create_subprocess_exec(*map(str, args), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, stderr = await process.communicate()
    if process.returncode:
        raise RuntimeError(f"{args[0]} failed ({process.returncode}): {stderr.decode(errors='replace')[-2500:]}")
    return stdout.decode()


async def generate_one(root, work, lecture, key, semaphore):
    import edge_tts
    dialect, voice = VOICES[key]
    original = root / lecture["transcript"]
    transcript = root / "assets/audio" / lecture["id"] / f"{dialect}.txt"
    output = root / lecture["recordings"][key]["path"]
    expected = {
        "sourceSummarySha256": digest(original),
        "transcriptSha256": digest(transcript),
        "voiceId": voice,
    }
    job = work / lecture["id"] / key
    job.mkdir(parents=True, exist_ok=True)
    receipt = job / "receipt.json"
    if receipt.exists() and output.exists():
        saved = json.loads(receipt.read_text())
        if all(saved.get(k) == v for k, v in expected.items()) and saved.get("sha256") == digest(output):
            print(f"RESUME {lecture['id']}/{key}: existing validated recording", flush=True)
            return saved
    async with semaphore:
        print(f"START {lecture['id']}/{key} ({voice})", flush=True)
        text = transcript.read_text(encoding="utf-8").strip()
        raw = job / "source.mp3"
        wav = job / "intermediate.wav"
        stage = job / "master.mp3"
        measurement = job / "measurements.json"
        # This bounded current task uses a maximum of two attempts per failed
        # free provider request. No already validated audio is regenerated.
        for attempt in range(2):
            try:
                stream = edge_tts.Communicate(text, voice, rate="-5%")
                size = 0
                with raw.open("wb") as handle:
                    async for chunk in stream.stream():
                        if chunk["type"] == "audio":
                            handle.write(chunk["data"])
                            size += len(chunk["data"])
                if size < 128:
                    raise ValueError("Provider returned no meaningful MP3")
                break
            except Exception:
                raw.unlink(missing_ok=True)
                if attempt:
                    raise
                print(f"RETRY {lecture['id']}/{key}: provider request failed; one retry", flush=True)
                await asyncio.sleep(3)
        await command("ffmpeg", "-v", "error", "-xerror", "-y", "-i", raw, "-c:a", "pcm_s16le", wav)
        mastering = (sys.executable, root / "scripts/prepare-exam-summary-audio.py", wav, stage,
                     "--report", measurement, "--title", f"{lecture['title']} — {key}",
                     "--comment", "AI neural narration; dialect adaptation of approved summary; compressed source")
        try:
            await command(*mastering)
        except RuntimeError as error:
            if "MP3 true peak exceeded the mastering safety margin" not in str(error):
                raise
            print(f"REMASTER {lecture['id']}/{key}: preserve speech source, use -2.5 dBTP ceiling", flush=True)
            await command(*mastering, "--true-peak", "-2.5")
        source = json.loads(await command("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                                         "stream=codec_name,sample_rate,channels,bit_rate:format=duration,size", "-of", "json", raw))
        report = json.loads(measurement.read_text())
        final = report["output"]
        seconds = float(final["format"]["duration"])
        loudness = float(report["output_loudness"]["input_i"])
        peak = float(report["output_loudness"]["input_tp"])
        if not (20 < seconds < 1800):
            raise ValueError(f"Unexpected recording duration: {seconds}")
        if not (-18 <= loudness <= -14) or peak > -1:
            raise ValueError(f"Mastering validation failed: LUFS {loudness}, peak {peak}")
        output.parent.mkdir(parents=True, exist_ok=True)
        # The work directory and repository may be separate mounts: copy only
        # completely mastered data, then atomically replace on the destination.
        temporary = output.with_suffix(".mp3.tmp")
        temporary.write_bytes(stage.read_bytes())
        temporary.replace(output)
        metadata = {
            "lectureId": lecture["id"], "key": key, "path": lecture["recordings"][key]["path"],
            "available": True, "transcript": transcript.relative_to(root).as_posix(),
            **expected, "sha256": digest(output), "bytes": output.stat().st_size,
            "durationSeconds": seconds, "provider": "edge-tts", "providerVersion": edge_tts.__version__,
            "generatedAt": datetime.now(timezone.utc).isoformat(), "rate": "-5%",
            "sampleRate": int(final["streams"][0]["sample_rate"]), "channels": final["streams"][0]["channels"],
            "bitrate": int(final["streams"][0]["bit_rate"]), "sourceBitrate": int(source["streams"][0]["bit_rate"]),
            "integratedLufs": loudness, "truePeakDbtp": peak,
            "masteringPeakTargetDbtp": report["target_true_peak_dbtp"],
            "qualityDisclosure": "AI neural voice; lossy source, not a human studio recording",
        }
        receipt.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
        print(f"DONE {lecture['id']}/{key}: {seconds:.1f}s, {metadata['bytes']} bytes, {loudness} LUFS", flush=True)
        return metadata


async def produce(args):
    root = args.root.resolve()
    work = args.work.resolve()
    manifest_path = root / "assets/audio/manifest.json"
    original_manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(original_manifest_bytes)
    if len(manifest["lectures"]) != 5:
        raise ValueError("This production request is scoped to exactly five existing lectures")
    jobs = []
    for lecture in manifest["lectures"]:
        if digest(root / lecture["transcript"]) != lecture["summarySha256"]:
            raise ValueError(f"Approved source changed: {lecture['id']}")
        if set(lecture["recordings"]) != set(VOICES):
            raise ValueError("Manifest must contain the expected six variants")
        for key, (dialect, voice) in VOICES.items():
            expected_path = f"assets/audio/{lecture['id']}/{key}.mp3"
            if lecture["recordings"][key]["path"] != expected_path:
                raise ValueError(f"Unsafe or mismatched output path: {expected_path}")
            transcript = root / "assets/audio" / lecture["id"] / f"{dialect}.txt"
            if not transcript.is_file() or len(transcript.read_text().strip()) < 100:
                raise ValueError(f"Missing complete speech-ready transcript: {transcript}")
            jobs.append((lecture, key))
    semaphore = asyncio.Semaphore(args.concurrency)
    tasks = [generate_one(root, work, lecture, key, semaphore) for lecture, key in jobs]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    good = [result for result in results if not isinstance(result, BaseException)]
    failures = [{"lectureId": jobs[i][0]["id"], "key": jobs[i][1], "error": str(result)}
                for i, result in enumerate(results) if isinstance(result, BaseException)]
    work.mkdir(parents=True, exist_ok=True)
    batch_report = {"requested": len(jobs), "completed": len(good), "recordings": good, "failures": failures}
    (work / "production-report.json").write_text(json.dumps(batch_report, ensure_ascii=False, indent=2) + "\n")
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2), flush=True)
        raise RuntimeError("Some recordings failed; manifest not enabled. Rerun resumes validated recordings.")
    if manifest_path.read_bytes() != original_manifest_bytes:
        raise RuntimeError("Manifest changed during production; do not overwrite concurrent changes")
    for lecture in manifest["lectures"]:
        if digest(root / lecture["transcript"]) != lecture["summarySha256"]:
            raise RuntimeError("Approved source changed during synthesis")
        for key in VOICES:
            metadata = next(result for result in good if result["lectureId"] == lecture["id"] and result["key"] == key)
            if digest(root / metadata["transcript"]) != metadata["transcriptSha256"]:
                raise RuntimeError("Spoken transcript changed during synthesis")
            lecture["recordings"][key] = {k: v for k, v in metadata.items() if k not in ("lectureId", "key")}
    manifest["audioProduction"] = {"provider": "edge-tts", "recordingCount": len(good), "neuralNotHuman": True,
                                   "dialectAdaptations": True, "complete": True}
    if not args.skip_enable:
        staged = manifest_path.with_suffix(".json.tmp")
        staged.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        staged.replace(manifest_path)
    print(f"COMPLETED {len(good)}/{len(jobs)} recordings; manifest {'not enabled (--skip-enable)' if args.skip_enable else 'updated'}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--work", type=Path, required=True, help="Nonpublic originals, receipts and measurement reports")
    parser.add_argument("--concurrency", type=int, choices=(1, 2, 3), default=2)
    parser.add_argument("--skip-enable", action="store_true", help="Keep manifest untouched for additional content QA")
    args = parser.parse_args()
    asyncio.run(produce(args))


if __name__ == "__main__":
    main()
