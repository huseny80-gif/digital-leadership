#!/usr/bin/env python3
"""Produce six neural narration variants for approved course summaries.

Requires the optional requirements-exam-audio.txt environment and ffmpeg/ffprobe.
No Git operations or future scheduling. Enable only after current-hash content QA.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
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


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalized(text):
    text = re.sub(r"[\u064b-\u065f\u0670\u0640]", "", text)
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه")
    return " ".join(re.sub(r"[^\w\s]", " ", text).lower().split())


def split_text(text, limit=1800):
    """Short paragraph requests avoid long-session silent truncation."""
    result = []
    for paragraph in re.split(r"\n\s*\n", text.strip()):
        paragraph = paragraph.strip()
        while len(paragraph) > limit:
            split = max(paragraph.rfind(". ", 0, limit), paragraph.rfind("؛ ", 0, limit), paragraph.rfind("\n", 0, limit))
            if split < limit // 3:
                split = paragraph.rfind(" ", 0, limit)
            if split <= 0:
                raise ValueError("Speech contains an oversized unbroken token")
            result.append(paragraph[:split + 1].strip())
            paragraph = paragraph[split + 1:].strip()
        if paragraph:
            result.append(paragraph)
    if normalized(" ".join(result)) != normalized(text):
        raise ValueError("Segmentation changed the spoken content")
    return result


async def command(*args):
    process = await asyncio.create_subprocess_exec(*map(str, args), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, stderr = await process.communicate()
    if process.returncode:
        raise RuntimeError(f"{args[0]} failed ({process.returncode}): {stderr.decode(errors='replace')[-2500:]}")
    return stdout.decode()


def matches_recording(saved, output, expected):
    return output.is_file() and all(saved.get(k) == v for k, v in expected.items()) and saved.get("sha256") == digest(output)


async def synthesize_parts(text, voice, job):
    import edge_tts
    chunks = split_text(text)
    folder = job / "parts"
    folder.mkdir(parents=True, exist_ok=True)
    names = []
    for index, chunk in enumerate(chunks, 1):
        path = folder / f"part-{index:03d}.mp3"
        receipt_path = path.with_suffix(".json")
        expected = {"textSha256": text_hash(chunk), "voiceId": voice, "rate": "-5%"}
        previous = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
        valid = matches_recording(previous, path, expected) and previous.get("boundaryComplete") is True
        if not valid:
            for attempt in range(2):
                try:
                    last_boundary, size = "", 0
                    stream = edge_tts.Communicate(chunk, voice, rate="-5%", boundary="WordBoundary")
                    with path.open("wb") as handle:
                        async for event in stream.stream():
                            if event["type"] == "audio":
                                handle.write(event["data"])
                                size += len(event["data"])
                            elif event["type"] == "WordBoundary":
                                last_boundary = event["text"]
                    expected_last = normalized(chunk).split()[-1]
                    if size < 128 or not normalized(last_boundary).endswith(expected_last):
                        raise ValueError("Provider returned incomplete audio or missing final word boundary")
                    await command("ffmpeg", "-v", "error", "-xerror", "-i", path, "-f", "null", "-")
                    receipt_path.write_text(json.dumps({**expected, "sha256": digest(path), "bytes": size,
                                                       "boundaryComplete": True, "lastBoundary": last_boundary}, ensure_ascii=False, indent=2) + "\n")
                    break
                except Exception:
                    path.unlink(missing_ok=True)
                    if attempt:
                        raise
                    print(f"RETRY SHORT SEGMENT {job.parent.name}/{job.name} {index}/{len(chunks)}", flush=True)
                    await asyncio.sleep(3)
        names.append(path.name)
        print(f"PART {job.parent.name}/{job.name}: {index}/{len(chunks)} complete", flush=True)
    listing = folder / "concat.txt"
    listing.write_text("".join(f"file '{name}'\n" for name in names))
    raw = job / "source.mp3"
    await command("ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", raw)
    return raw, len(chunks)


async def generate_one(root, work, lecture, key, semaphore):
    import edge_tts
    dialect, voice = VOICES[key]
    original = root / lecture["transcript"]
    transcript = root / "assets/audio" / lecture["id"] / f"{dialect}.txt"
    output = root / lecture["recordings"][key]["path"]
    expected = {"sourceSummarySha256": digest(original), "transcriptSha256": digest(transcript), "voiceId": voice}
    job = work / lecture["id"] / key
    job.mkdir(parents=True, exist_ok=True)
    receipt = job / "receipt.json"
    candidates = ([json.loads(receipt.read_text())] if receipt.exists() else []) + [lecture["recordings"][key]]
    for saved in candidates:
        if matches_recording(saved, output, expected):
            metadata = {**saved, "lectureId": lecture["id"], "key": key}
            print(f"RESUME {lecture['id']}/{key}: existing validated recording", flush=True)
            receipt.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
            return metadata
    async with semaphore:
        print(f"START {lecture['id']}/{key} ({voice})", flush=True)
        text = transcript.read_text().strip()
        raw, segment_count = await synthesize_parts(text, voice, job)
        wav, stage, measurement = job / "intermediate.wav", job / "master.mp3", job / "measurements.json"
        await command("ffmpeg", "-v", "error", "-xerror", "-y", "-i", raw, "-c:a", "pcm_s16le", wav)
        mastering = (sys.executable, root / "scripts/prepare-exam-summary-audio.py", wav, stage,
                     "--report", measurement, "--title", f"{lecture['title']} — {key}",
                     "--comment", "AI neural narration; dialect adaptation of approved summary; compressed source")
        try:
            await command(*mastering)
        except RuntimeError as error:
            if "MP3 true peak exceeded the mastering safety margin" not in str(error):
                raise
            print(f"REMASTER {lecture['id']}/{key}: preserve source, -2.5 dBTP ceiling", flush=True)
            await command(*mastering, "--true-peak", "-2.5")
        source = json.loads(await command("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                                         "stream=codec_name,sample_rate,channels,bit_rate:format=duration,size", "-of", "json", raw))
        report = json.loads(measurement.read_text())
        final = report["output"]
        seconds = float(final["format"]["duration"])
        loudness, peak = float(report["output_loudness"]["input_i"]), float(report["output_loudness"]["input_tp"])
        if not (20 < seconds < 1800):
            raise ValueError(f"Unexpected recording duration: {seconds}")
        if not (-18 <= loudness <= -14) or peak > -1:
            raise ValueError(f"Mastering validation failed: LUFS {loudness}, peak {peak}")
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(".mp3.tmp")
        temporary.write_bytes(stage.read_bytes())
        temporary.replace(output)
        metadata = {"lectureId": lecture["id"], "key": key, "path": lecture["recordings"][key]["path"],
                    "available": True, "transcript": transcript.relative_to(root).as_posix(), **expected,
                    "sha256": digest(output), "bytes": output.stat().st_size, "durationSeconds": seconds,
                    "provider": "edge-tts", "providerVersion": edge_tts.__version__,
                    "generatedAt": datetime.now(timezone.utc).isoformat(), "rate": "-5%",
                    "sampleRate": int(final["streams"][0]["sample_rate"]), "channels": final["streams"][0]["channels"],
                    "bitrate": int(final["streams"][0]["bit_rate"]), "sourceBitrate": int(source["streams"][0]["bit_rate"]),
                    "integratedLufs": loudness, "truePeakDbtp": peak,
                    "masteringPeakTargetDbtp": report["target_true_peak_dbtp"], "segmentCount": segment_count,
                    "segmentBoundariesVerified": True,
                    "qualityDisclosure": "AI neural voice; lossy source, not a human studio recording"}
        receipt.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
        print(f"DONE {lecture['id']}/{key}: {seconds:.1f}s, {metadata['bytes']} bytes, {loudness} LUFS", flush=True)
        return metadata


def validate_content_qa(path, recordings):
    if not path or not path.is_file():
        raise ValueError("Enabling recordings requires --content-verification of current MP3 hashes")
    qa = json.loads(path.read_text())
    if qa.get("errors"):
        raise ValueError("Content verification has unresolved errors")
    verified = {(row["lectureId"], row["key"]): row for row in qa.get("results", [])}
    for recording in recordings:
        row = verified.get((recording["lectureId"], recording["key"]), {})
        if row.get("audioSha256") != recording["sha256"] or not row.get("passesAutomaticCompleteness"):
            raise ValueError(f"Missing or stale content verification: {recording['lectureId']}/{recording['key']}")


async def produce(args):
    root, work = args.root.resolve(), args.work.resolve()
    manifest_path = root / "assets/audio/manifest.json"
    original_manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(original_manifest_bytes)
    lectures = manifest.get("lectures", [])
    if not lectures or len({row["id"] for row in lectures}) != len(lectures):
        raise ValueError("Manifest must contain unique approved lectures")
    selection = getattr(args, "subject", None)
    if selection:
        lectures = [lecture for lecture in lectures if lecture.get("subjectId") == selection or lecture.get("subjectSlug") == selection]
        if not lectures:
            raise ValueError("Unknown subject selection")
    jobs = []
    for lecture in lectures:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", lecture["id"]):
            raise ValueError("Unsafe lecture identifier")
        if lecture["transcript"] != f"assets/audio/{lecture['id']}/summary.txt":
            raise ValueError("Unsafe source transcript path")
        if digest(root / lecture["transcript"]) != lecture["summarySha256"]:
            raise ValueError(f"Approved source changed: {lecture['id']}")
        if set(lecture["recordings"]) != set(VOICES):
            raise ValueError("Manifest must contain the expected six variants")
        for key, (dialect, _) in VOICES.items():
            expected_path = f"assets/audio/{lecture['id']}/{key}.mp3"
            if lecture["recordings"][key]["path"] != expected_path:
                raise ValueError(f"Unsafe or mismatched output path: {expected_path}")
            transcript = root / "assets/audio" / lecture["id"] / f"{dialect}.txt"
            if not transcript.is_file() or len(transcript.read_text().strip()) < 100:
                raise ValueError(f"Missing complete speech-ready transcript: {transcript}")
            jobs.append((lecture, key))
    semaphore = asyncio.Semaphore(args.concurrency)
    results = await asyncio.gather(*(generate_one(root, work, lecture, key, semaphore) for lecture, key in jobs), return_exceptions=True)
    good = [result for result in results if not isinstance(result, BaseException)]
    failures = [{"lectureId": jobs[i][0]["id"], "key": jobs[i][1], "error": str(result)}
                for i, result in enumerate(results) if isinstance(result, BaseException)]
    work.mkdir(parents=True, exist_ok=True)
    report = {"requested": len(jobs), "completed": len(good), "recordings": good, "failures": failures}
    (work / "production-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2), flush=True)
        raise RuntimeError("Some recordings failed; manifest not enabled. Rerun resumes validated recordings.")
    if manifest_path.read_bytes() != original_manifest_bytes:
        raise RuntimeError("Manifest changed during production; do not overwrite concurrent changes")
    for lecture in lectures:
        if digest(root / lecture["transcript"]) != lecture["summarySha256"]:
            raise RuntimeError("Approved source changed during synthesis")
        for key in VOICES:
            metadata = next(row for row in good if row["lectureId"] == lecture["id"] and row["key"] == key)
            if digest(root / metadata["transcript"]) != metadata["transcriptSha256"]:
                raise RuntimeError("Spoken transcript changed during synthesis")
            lecture["recordings"][key] = {k: v for k, v in metadata.items() if k not in ("lectureId", "key")}
    count = sum(rec["available"] for lecture in manifest["lectures"] for rec in lecture["recordings"].values())
    manifest["audioProduction"] = {"provider": "edge-tts", "recordingCount": count, "neuralNotHuman": True,
                                   "dialectAdaptations": True, "complete": count == len(manifest["lectures"]) * len(VOICES)}
    if not args.skip_enable:
        validate_content_qa(getattr(args, "content_verification", None), good)
        staged = manifest_path.with_suffix(".json.tmp")
        staged.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        staged.replace(manifest_path)
    print(f"COMPLETED {len(good)}/{len(jobs)} recordings; manifest {'not enabled (--skip-enable)' if args.skip_enable else 'updated'}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--work", type=Path, required=True, help="Nonpublic originals, receipts and measurements")
    parser.add_argument("--concurrency", type=int, choices=(1, 2, 3), default=2)
    parser.add_argument("--subject", help="Optional allowlisted subject UUID or slug")
    parser.add_argument("--skip-enable", action="store_true", help="Generate but do not enable before content QA")
    parser.add_argument("--content-verification", type=Path, help="Current-hash content-verification JSON required for enabling")
    asyncio.run(produce(parser.parse_args()))


if __name__ == "__main__":
    main()
