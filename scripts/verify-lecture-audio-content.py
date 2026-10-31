#!/usr/bin/env python3
"""Transcribe actual MP3s and compare against their spoken transcripts.

Internal delivery verification, not a human listening or dialect certification.
Requires manus-speech-to-text installed in the execution environment.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile


def normalized(text):
    text = re.sub(r"[\u064b-\u065f\u0670\u0640]", "", text)
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه")
    text = re.sub(r"[^\u0621-\u063a\u0641-\u064a\u0660-\u0669\w\s]", " ", text)
    return " ".join(text.lower().split())


def verify(root, work, recording):
    name = recording["lectureId"] + "-" + recording["key"]
    folder = work / name
    folder.mkdir(parents=True, exist_ok=True)
    audio = folder / "recording.mp3"
    log = folder / "transcription.log"
    source_bytes = (root / recording["path"]).read_bytes()
    current_hash = hashlib.sha256(source_bytes).hexdigest()
    if current_hash != recording["sha256"]:
        raise ValueError(f"MP3 changed since production receipt: {name}")
    if log.exists() and (not audio.exists() or hashlib.sha256(audio.read_bytes()).hexdigest() != current_hash):
        rejected = folder / "stale-previous-verification"
        rejected.mkdir(exist_ok=True)
        for old in list(folder.glob("recording*")) + [log]:
            if old.is_file(): old.replace(rejected / old.name)
    if not log.exists():
        # CLI writes adjacent outputs; isolate all temporary transcription files
        # outside the repository rather than add them to production audio.
        audio.write_bytes(source_bytes)
        process = subprocess.run(["manus-speech-to-text", str(audio)], capture_output=True, text=True, timeout=300)
        log.write_text(process.stdout + "\n" + process.stderr)
        if process.returncode:
            raise RuntimeError(f"Transcription failed: {name}")
    transcripts = sorted(folder.glob("recording_transcription_*.txt"))
    if not transcripts:
        raise ValueError(f"No transcription text for {name}")
    actual = transcripts[-1].read_text()
    actual = re.sub(r"\[[^\]]*\]", "", actual)
    expected = (root / recording["transcript"]).read_text()
    a, b = normalized(expected), normalized(actual)
    ratio = SequenceMatcher(None, a, b, autojunk=False).ratio()
    token_a, token_b = a.split(), b.split()
    opening = SequenceMatcher(None, " ".join(token_a[:35]), " ".join(token_b[:45]), autojunk=False).ratio()
    ending = SequenceMatcher(None, " ".join(token_a[-35:]), " ".join(token_b[-45:]), autojunk=False).ratio()
    result = {"lectureId": recording["lectureId"], "key": recording["key"], "path": recording["path"],
              "audioSha256": current_hash,
              "textSimilarity": round(ratio, 4), "openingSimilarity": round(opening, 4),
              "endingSimilarity": round(ending, 4), "expectedWords": len(token_a), "transcribedWords": len(token_b),
              "passesAutomaticCompleteness": ratio >= 0.80 and opening >= 0.65 and ending >= 0.65,
              "humanListening": False, "dialectHumanCertification": False}
    print(f"QA {name}: full similarity {ratio:.3f}, opening {opening:.3f}, ending {ending:.3f}", flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--production-report", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--concurrency", type=int, choices=(1, 2, 3), default=2)
    args = parser.parse_args()
    data = json.loads(args.production_report.read_text())
    recordings = data["recordings"]
    args.work.mkdir(parents=True, exist_ok=True)
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        tasks = {executor.submit(verify, args.root, args.work, recording): recording for recording in recordings}
        for task in as_completed(tasks):
            try: results.append(task.result())
            except Exception as error:
                recording = tasks[task]
                errors.append({"lectureId": recording["lectureId"], "key": recording["key"], "error": str(error)})
                print(f"QA ERROR {recording['lectureId']}/{recording['key']}: {error}", flush=True)
    results.sort(key=lambda x: (x["lectureId"], x["key"]))
    report = {"checked": len(results), "results": results, "errors": errors,
              "limitations": "Automated transcription comparison, not human listening; dialect and voice identity follow provider catalog, not certified by ASR"}
    (args.work / "content-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if errors or any(not result["passesAutomaticCompleteness"] for result in results):
        raise SystemExit("Some audio contents need targeted review; do not claim all pass")
    print(f"All {len(results)} recordings passed automatic content-completeness checks", flush=True)


if __name__ == "__main__":
    main()
