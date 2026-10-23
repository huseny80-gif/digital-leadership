#!/usr/bin/env python3
import argparse
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("producer", Path(__file__).with_name("produce-lecture-audio.py"))
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "repo"
        self.work = Path(self.temporary.name) / "work"
        self.manifest = self.root / "assets/audio/manifest.json"
        lectures = []
        for number in range(1, 6):
            id_ = f"innovation-{number:02d}"
            folder = self.root / "assets/audio" / id_
            folder.mkdir(parents=True)
            for name in ("summary", "msa", "iraqi", "saudi"):
                (folder / f"{name}.txt").write_text("نص أكاديمي للمراجعة. " * 20)
            lectures.append({"id": id_, "title": id_, "transcript": f"assets/audio/{id_}/summary.txt",
                             "summarySha256": producer.digest(folder / "summary.txt"),
                             "recordings": {key: {"path": f"assets/audio/{id_}/{key}.mp3", "available": False}
                                            for key in producer.VOICES}})
        self.data = {"lectures": lectures}
        self.manifest.write_text(json.dumps(self.data))
        self.before = self.manifest.read_bytes()
        self.args = argparse.Namespace(root=self.root, work=self.work, concurrency=2, skip_enable=False)

    def tearDown(self):
        self.temporary.cleanup()

    def test_reject_changed_approved_source(self):
        (self.root / self.data["lectures"][0]["transcript"]).write_text("Changed")
        with self.assertRaisesRegex(ValueError, "Approved source changed"):
            asyncio.run(producer.produce(self.args))
        self.assertEqual(self.before, self.manifest.read_bytes())

    def test_reject_missing_dialect(self):
        (self.root / "assets/audio/innovation-01/iraqi.txt").unlink()
        with self.assertRaisesRegex(ValueError, "Missing complete"):
            asyncio.run(producer.produce(self.args))
        self.assertEqual(self.before, self.manifest.read_bytes())

    def test_reject_unsafe_output_path(self):
        self.data["lectures"][0]["recordings"]["msa-male"]["path"] = "../../outside.mp3"
        self.manifest.write_text(json.dumps(self.data))
        with self.assertRaisesRegex(ValueError, "Unsafe or mismatched"):
            asyncio.run(producer.produce(self.args))

    def test_failed_batch_does_not_enable_manifest(self):
        async def failure(*args):
            raise RuntimeError("provider unavailable")
        with patch.object(producer, "generate_one", failure):
            with self.assertRaisesRegex(RuntimeError, "Some recordings failed"):
                asyncio.run(producer.produce(self.args))
        self.assertEqual(self.before, self.manifest.read_bytes())
        report = json.loads((self.work / "production-report.json").read_text())
        self.assertEqual(report["completed"], 0)
        self.assertEqual(len(report["failures"]), 30)


if __name__ == "__main__":
    unittest.main()
