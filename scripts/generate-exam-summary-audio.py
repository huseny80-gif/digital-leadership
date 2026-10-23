#!/usr/bin/env python3
"""Generate the public demo narration using Edge TTS in an optional local venv.

Does not alter the application's protected narration adapter, publish, or push.
Dependencies: requirements-exam-audio.txt, ffmpeg, ffprobe.
"""
import argparse
import asyncio
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("transcript", type=Path)
    parser.add_argument("output", type=Path, help="Separate WAV intermediate file")
    args = parser.parse_args()
    if not args.transcript.is_file():
        parser.error("Transcript does not exist")
    if args.output.suffix.lower() != ".wav" or args.output.resolve() == args.transcript.resolve():
        parser.error("Output must be a separate .wav file")
    if not shutil.which("ffmpeg"):
        parser.error("ffmpeg must be installed")
    try:
        import edge_tts
    except ImportError:
        parser.error("Install scripts/requirements-exam-audio.txt in your Python environment")
    text = args.transcript.read_text(encoding="utf-8").strip()
    if not text or len(text) > 6000:
        parser.error("Use a nonempty demo transcript of at most 6000 characters")
    voice = "ar-IQ-BasselNeural"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="exam-summary-") as folder:
        mp3 = Path(folder) / "source.mp3"
        wav = Path(folder) / "intermediate.wav"
        print(f"Generating narration with {voice}, rate -5%", flush=True)
        asyncio.run(edge_tts.Communicate(text, voice, rate="-5%").save(str(mp3)))
        subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-y", "-i", str(mp3),
                        "-c:a", "pcm_s16le", str(wav)], check=True, timeout=120)
        shutil.copyfile(wav, args.output)
    print(f"Generated {args.output}; this WAV is decoded from the provider's compressed MP3", flush=True)


if __name__ == "__main__":
    main()
