#!/usr/bin/env python3
"""Prepare published course summaries and safe six-voice manifests; no TTS or Git."""
import argparse
import hashlib
import json
from pathlib import Path
import re

VOICES = ("msa-male", "msa-female", "iraqi-male", "iraqi-female", "saudi-male", "saudi-female")


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical(lecture, summary):
    return lecture["title"] + "\n\n" + summary["overview"] + "\n\n" + "\n\n".join(
        section["heading"] + "\n" + "\n".join(point["term"] + ": " + point["text"] for point in section["points"])
        for section in summary["sections"]
    ) + "\n"


def prepare(root, check=False):
    # The app and backend share these identities. Do not maintain a second map
    # or require UUID literals in catalog.ts, which imports this same authority.
    course_source = (root / "shared/src/studyCourses.ts").read_text()
    course_block = re.search(r"export const STUDY_COURSES\s*=\s*\[([\s\S]*?)\]\s*as const", course_source)
    if not course_block:
        raise ValueError("Shared study course identities could not be read")
    pairs = re.findall(r'\{\s*slug:\s*"([a-z0-9-]+)",\s*id:\s*"([a-f0-9-]+)"', course_block[1])
    subject_uuids = dict(pairs)
    if not pairs or len(subject_uuids) != len(pairs) or len(set(subject_uuids.values())) != len(pairs) or any(
        not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", uuid) for uuid in subject_uuids.values()
    ):
        raise ValueError("Shared study course identities are invalid or duplicated")
    catalog = json.loads((root / "backend/content/finquiz/catalog.json").read_text())
    summaries = json.loads((root / "backend/content/finquiz/academicSummaries.json").read_text())
    lookup = {summary["lectureId"]: summary for summary in summaries["summaries"]}
    manifest_path = root / "assets/audio/manifest.json"
    previous = json.loads(manifest_path.read_text())
    old = {entry["id"]: entry for entry in previous["lectures"]}
    # Offline recording metadata is independent of the subject-owned app UI.
    embedded = json.loads((root / "assets/audio/study-data.json").read_text())
    old_display = {entry["id"]: entry for entry in embedded["lectures"]}
    subjects, lectures, entries = [], [], []
    for subject in catalog["subjects"]:
        slug = subject["id"]
        if slug not in subject_uuids:
            raise ValueError(f"Subject UUID not present in shared study courses: {slug}")
        uuid = subject_uuids[slug]
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
                # Preserve the complete custom recording already accepted by
                # the asset publisher, without accepting arbitrary file paths.
                prior_path = (f"assets/audio/{id_}/saudi-elevenlabs-part-01.mp3"
                              if recording and recording.get("provider") == "ElevenLabs"
                              and voice == "saudi-male" and recording.get("complete") is True else path)
                if (recording and prior.get("summarySha256") == sha(text)
                        and prior.get("sourceSha256") == summary["sha256"] and recording.get("path") == prior_path):
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
            "defaultSubjectId": subject_uuids["innovation-project-management"], "subjects": subjects,
            "voices": embedded["voices"], "lectures": lectures}
    manifest = {"version": 1, "summaryRevision": revision, "defaultSubjectId": data["defaultSubjectId"],
                "subjects": subjects, "lectures": entries}
    available = sum(rec["available"] for entry in entries for rec in entry["recordings"].values())
    if available == len(entries) * len(VOICES):
        manifest["audioProduction"] = {"provider": "edge-tts", "recordingCount": available,
                                       "neuralNotHuman": True, "dialectAdaptations": True, "complete": True}
    expected_files = {manifest_path: json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                      root / "assets/audio/study-data.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n"}
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
