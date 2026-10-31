#!/usr/bin/env python3
"""Prepare published course summaries and safe six-voice manifests; no TTS or Git."""
import argparse
import hashlib
import json
from pathlib import Path
import re

SUBJECT_UUIDS = {
    "ai-data": "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
    "cybersecurity-governance": "bc861a76-620d-4646-81ca-c49d24665b75",
    "innovation-project-management": "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
    "legal-regulatory": "ade09563-02ec-4a09-a97b-58857f6cd876",
    "risk-management": "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
}
VOICES = ("msa-male", "msa-female", "iraqi-male", "iraqi-female", "saudi-male", "saudi-female")


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical(lecture, summary):
    return lecture["title"] + "\n\n" + summary["overview"] + "\n\n" + "\n\n".join(
        section["heading"] + "\n" + "\n".join(point["term"] + ": " + point["text"] for point in section["points"])
        for section in summary["sections"]
    ) + "\n"


def prepare(root, check=False):
    catalog = json.loads((root / "backend/content/finquiz/catalog.json").read_text())
    summaries = json.loads((root / "backend/content/finquiz/academicSummaries.json").read_text())
    lookup = {summary["lectureId"]: summary for summary in summaries["summaries"]}
    manifest_path = root / "assets/audio/manifest.json"
    previous = json.loads(manifest_path.read_text())
    old = {entry["id"]: entry for entry in previous["lectures"]}
    html = (root / "summaries.html").read_text()
    embedded = json.loads(re.search(r'<script type="application/json" id="summaries-data">([\s\S]*?)</script>', html).group(1))
    old_display = {entry["id"]: entry for entry in embedded["lectures"]}
    subjects, lectures, entries = [], [], []
    source_mapping = (root / "backend/src/finquiz/catalog.ts").read_text() + (root / "shared/src/studyCourses.ts").read_text()
    for subject in catalog["subjects"]:
        slug = subject["id"]
        uuid = SUBJECT_UUIDS[slug]
        if uuid not in source_mapping:
            raise ValueError(f"Subject UUID not present in source mapping: {slug}")
        subjects.append({"id": uuid, "slug": slug, "title": subject["title"]})
        for lecture in subject["lectures"]:
            summary = lookup.get(lecture["id"])
            if not summary:
                raise ValueError(f"Published lecture lacks approved summary: {lecture['id']}")
            id_ = f"innovation-{lecture['number']:02d}" if slug == "innovation-project-management" else lecture["id"]
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", id_):
                raise ValueError(f"Unsafe audio asset identifier: {id_}")
            folder = root / "assets/audio" / id_
            if id_.startswith("innovation-"):
                # Preserve exact approved source bytes and existing recording paths.
                text = (folder / "summary.txt").read_text()
                display = dict(old_display[id_])
            else:
                text = canonical(lecture, summary)
                display = {"id": id_, "number": lecture["number"], "title": lecture["title"],
                           "overview": summary["overview"], "sections": summary["sections"], "transcript": text,
                           "summarySha256": sha(text), "sha256": summary["sha256"]}
            display.update({"subjectId": uuid, "subjectSlug": slug, "catalogLectureId": lecture["id"]})
            if display["sha256"] != summary["sha256"] or display["summarySha256"] != sha(text):
                raise ValueError(f"Approved displayed source mismatch: {id_}")
            lectures.append(display)
            entry = {"id": id_, "number": lecture["number"], "title": lecture["title"], "subjectId": uuid,
                     "subjectSlug": slug, "catalogLectureId": lecture["id"], "sourceSha256": summary["sha256"],
                     "summarySha256": sha(text), "transcript": f"assets/audio/{id_}/summary.txt", "recordings": {}}
            prior = old.get(id_, {})
            for voice in VOICES:
                path = f"assets/audio/{id_}/{voice}.mp3"
                recording = prior.get("recordings", {}).get(voice)
                if recording and prior.get("summarySha256") == sha(text) and recording.get("path") == path:
                    entry["recordings"][voice] = dict(recording)
                else:
                    entry["recordings"][voice] = {"path": path, "available": False}
            if check:
                if not (folder / "summary.txt").is_file() or (folder / "summary.txt").read_text() != text:
                    raise ValueError(f"Canonical summary differs: {id_}")
            else:
                folder.mkdir(parents=True, exist_ok=True)
                (folder / "summary.txt").write_text(text)
            entries.append(entry)
    stable = {"subjects": subjects, "lectures": lectures}
    revision = sha(json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":")))[:20]
    data = {"revision": revision, "courseTitle": "المواد الدراسية", "sourceCommit": catalog["sourceCommit"],
            "defaultSubjectId": SUBJECT_UUIDS["innovation-project-management"], "subjects": subjects,
            "voices": embedded["voices"], "lectures": lectures}
    manifest = {"version": 1, "summaryRevision": revision, "defaultSubjectId": data["defaultSubjectId"],
                "subjects": subjects, "lectures": entries}
    available = sum(rec["available"] for entry in entries for rec in entry["recordings"].values())
    if available == len(entries) * len(VOICES):
        manifest["audioProduction"] = {"provider": "edge-tts", "recordingCount": available,
                                       "neuralNotHuman": True, "dialectAdaptations": True, "complete": True}
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    new_html = re.sub(r'(<script type="application/json" id="summaries-data">)[\s\S]*?(</script>)',
                      lambda match: match.group(1) + encoded + match.group(2), html, count=1)
    expected_files = {manifest_path: json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                      root / "assets/audio/study-data.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                      root / "summaries.html": new_html}
    for path, content in expected_files.items():
        if check:
            if not path.is_file() or path.read_text() != content:
                raise ValueError(f"Generated study data is stale: {path}")
        else:
            path.write_text(content)
    print(f"Prepared {len(subjects)} subjects, {len(entries)} summaries; {available}/{len(entries) * len(VOICES)} recordings available")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    prepare(args.root.resolve(), args.check)


if __name__ == "__main__":
    main()
