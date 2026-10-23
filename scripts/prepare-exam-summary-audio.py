#!/usr/bin/env python3
"""Master a generated narration WAV to MP3 without artificial upsampling.

Requires ffmpeg and ffprobe on PATH. Does not generate speech or push Git.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def run(command):
    return subprocess.run(command, check=True, capture_output=True, text=True)


def probe(path):
    return json.loads(run([
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate:format=duration,size",
        "-of", "json", str(path),
    ]).stdout)


def loudness(path):
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json",
        "-f", "null", "-",
    ])
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr, re.S)
    if not matches:
        raise ValueError("ffmpeg returned no loudness measurements")
    data = json.loads(matches[-1])
    if any(data[key] in ("-inf", "inf", "nan") for key in ("input_i", "input_tp", "input_lra", "input_thresh")):
        raise ValueError("Input must contain measurable, non-silent narration")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Original generated WAV (kept unchanged)")
    parser.add_argument("output", type=Path, help="Destination MP3")
    parser.add_argument("--report", type=Path, help="Optional JSON measurement report")
    args = parser.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            parser.error(f"Required tool not found: {tool}")
    if not args.input.is_file() or args.input.suffix.lower() != ".wav":
        parser.error("Input must be an existing WAV file")
    if args.output.suffix.lower() != ".mp3" or args.input.resolve() == args.output.resolve():
        parser.error("Output must be a separate .mp3 file")
    original = probe(args.input)
    stream = original["streams"][0]
    rate, channels = int(stream["sample_rate"]), int(stream["channels"])
    if rate not in (8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000) or channels not in (1, 2):
        parser.error("Source sample rate/channel count is not natively supported by this MP3 pipeline")
    bitrate = "160k" if rate < 32000 else "320k"
    measured = loudness(args.input)
    settings = ":".join([
        "loudnorm=I=-16:TP=-1.5:LRA=7",
        f"measured_I={measured['input_i']}", f"measured_TP={measured['input_tp']}",
        f"measured_LRA={measured['input_lra']}", f"measured_thresh={measured['input_thresh']}",
        f"offset={measured['target_offset']}", "linear=true", "print_format=json",
    ])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="exam-audio-", dir=args.output.parent) as folder:
        staged = Path(folder) / "summary.mp3"
        run([
            "ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(args.input),
            "-map", "0:a:0", "-vn", "-af", settings,
            "-ar", str(rate), "-ac", str(channels), "-c:a", "libmp3lame",
            "-b:a", bitrate, "-compression_level", "0", "-id3v2_version", "3",
            "-metadata", "title=القيادة الرقمية واتخاذ القرار الاستراتيجي",
            "-metadata", "artist=منصة القيادة الرقمية",
            "-metadata", "comment=AI-generated educational demonstration; not an approved exam syllabus",
            str(staged),
        ])
        # Decode the complete output, not just its header, before replacing it.
        run(["ffmpeg", "-v", "error", "-xerror", "-i", str(staged), "-f", "null", "-"])
        output = probe(staged)
        final = loudness(staged)
        assert output["streams"][0]["codec_name"] == "mp3"
        assert int(output["streams"][0]["sample_rate"]) == rate
        assert float(output["format"]["duration"]) > 0
        if float(final["input_tp"]) > -1.0:
            raise ValueError("MP3 true peak exceeded the mastering safety margin")
        staged.replace(args.output)
    report = {"source": original, "output": output, "source_loudness": measured,
              "output_loudness": final, "target_lufs": -16, "target_true_peak_dbtp": -1.5,
              "native_sample_rate_preserved": True, "requested_bitrate": bitrate}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
