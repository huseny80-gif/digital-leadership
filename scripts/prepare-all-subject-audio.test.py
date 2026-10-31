#!/usr/bin/env python3
"""Regression checks for the offline recording inventory; no provider calls."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare_audio", Path(__file__).with_name("prepare-all-subject-audio.py"))
prepare_audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare_audio)


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for path in ("shared/src", "backend/content/finquiz", "assets/audio/ai-l1"):
            (self.root / path).mkdir(parents=True)
        self.course_source = self.root / "shared/src/studyCourses.ts"
        self.course_source.write_text('export const STUDY_COURSES = [\n'
            '{ slug: "ai-data", id: "2d6c0980-e4d2-4687-9027-cf090b3d1a67" },\n'
            '{ slug: "innovation-project-management", id: "7eb2b714-570f-4ed0-a00e-10efec7a20e5" },\n] as const;')
        self.summary = {"lectureId": "ai-l1", "sha256": "a" * 64, "overview": "عرض تجريبي.",
                        "sections": [{"heading": "محور تجريبي", "points": [{"term": "مفهوم", "text": "شرح تجريبي."}]}]}
        self.lecture = {"id": "ai-l1", "title": "محاضرة تجريبية", "number": 1}
        self.recording = {"path": "assets/audio/ai-l1/saudi-elevenlabs-part-01.mp3", "available": True,
                          "provider": "ElevenLabs", "complete": True, "voiceId": "nPczCjzI2devNBz1zQrb"}
        entry = {"id": "ai-l1", "sourceSha256": self.summary["sha256"],
                 "summarySha256": prepare_audio.sha(prepare_audio.canonical(self.lecture, self.summary)),
                 "recordings": {voice: {"path": f"assets/audio/ai-l1/{voice}.mp3", "available": False}
                                for voice in prepare_audio.VOICES}}
        entry["recordings"]["saudi-male"] = self.recording
        self.previous = {"lectures": [entry]}
        self.write("backend/content/finquiz/catalog.json", {"sourceCommit": "fixture", "subjects": [
            {"id": "ai-data", "title": "مادة تجريبية", "lectures": [self.lecture]}]})
        self.write("backend/content/finquiz/academicSummaries.json", {"summaries": [self.summary]})
        self.write("assets/audio/study-data.json", {"lectures": [], "voices": []})
        self.write("assets/audio/manifest.json", self.previous)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, path, data):
        (self.root / path).write_text(json.dumps(data, ensure_ascii=False))

    def result(self):
        prepare_audio.prepare(self.root)
        return json.loads((self.root / "assets/audio/manifest.json").read_text())["lectures"][0]

    def test_preserves_complete_existing_custom_recording_and_uses_shared_course_identity(self):
        result = self.result()
        self.assertEqual(result["recordings"]["saudi-male"], self.recording)
        self.assertEqual(result["subjectId"], "2d6c0980-e4d2-4687-9027-cf090b3d1a67")
        prepare_audio.prepare(self.root, check=True)

    def test_does_not_reuse_audio_from_a_different_source_even_if_summary_text_is_unchanged(self):
        entry = self.previous["lectures"][0]
        entry["sourceSha256"] = "b" * 64
        entry["recordings"]["msa-male"]["available"] = True
        self.write("assets/audio/manifest.json", self.previous)
        self.assertFalse(self.result()["recordings"]["msa-male"]["available"])

    def test_rejects_a_cross_lecture_custom_recording_path(self):
        self.recording["path"] = "assets/audio/other/saudi-elevenlabs-part-01.mp3"
        self.write("assets/audio/manifest.json", self.previous)
        self.assertFalse(self.result()["recordings"]["saudi-male"]["available"])

    def test_rejects_malformed_shared_course_identities_before_writing(self):
        self.course_source.write_text('export const STUDY_COURSES = [{ slug: "ai-data", id: "invalid" }] as const;')
        before = (self.root / "assets/audio/manifest.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "identities are invalid"):
            self.result()
        self.assertEqual(before, (self.root / "assets/audio/manifest.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
