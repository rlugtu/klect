#!/usr/bin/env python3
"""Spec-driven ad builder. Usage: python3 tools/build.py specs/concept1-hookA.json

Spec (all times in seconds):
{
  "out": "build/concept1-hookA.mp4",
  "segments": [
    {"type": "rec",    "src": "raw/take.mp4", "start": 14.2, "end": 15.6, "speed": 1},
    {"type": "image",  "png": "build/bg.png", "dur": 3},
    {"type": "scroll", "png": "build/tall.png", "dur": 4, "y0": 0, "y1": 2000}
  ],
  "overlays": [{"png": "build/t1.png", "start": 0, "end": 3.8}],
  "end": {"png": "build/end.png", "dur": 2.5}
}
Output: 1080x1920, 30fps, silent (add trending audio inside TikTok/Instagram).
Recordings are 1206x2622 simulator captures: scaled to 1080 wide, top 190px cropped (status-bar black),
which also drops the bottom dev toast.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIT = "fps=30,scale=1080:-2,crop=1080:1920:0:190,setsar=1"


def build(spec_path: str) -> None:
    spec = json.loads(Path(spec_path).read_text())
    inputs: list[list[str]] = []
    filters: list[str] = []
    labels: list[str] = []
    rec_index: dict[str, int] = {}

    def add_input(args: list[str]) -> int:
        inputs.append(args)
        return len(inputs) - 1

    total = 0.0
    for i, seg in enumerate(spec["segments"]):
        kind = seg["type"]
        lab = f"s{i}"
        if kind == "rec":
            src = seg["src"]
            if src not in rec_index:
                rec_index[src] = add_input(["-i", str(ROOT / src)])
            idx = rec_index[src]
            speed = seg.get("speed", 1)
            mask = spec.get("mask")
            if mask:
                midx = add_input(["-loop", "1", "-framerate", "30", "-i", str(ROOT / mask)])
                filters.append(
                    f"[{idx}:v]trim={seg['start']}:{seg['end']},setpts=(PTS-STARTPTS)/{speed},{FIT}[{lab}p];"
                    f"[{lab}p][{midx}:v]overlay=0:0:shortest=1[{lab}]"
                )
            else:
                filters.append(
                    f"[{idx}:v]trim={seg['start']}:{seg['end']},setpts=(PTS-STARTPTS)/{speed},{FIT}[{lab}]"
                )
            total += (seg["end"] - seg["start"]) / speed
        elif kind == "image":
            idx = add_input(["-loop", "1", "-framerate", "30", "-t", str(seg["dur"]), "-i", str(ROOT / seg["png"])])
            filters.append(f"[{idx}:v]scale=1080:1920,setsar=1,fps=30[{lab}]")
            total += seg["dur"]
        elif kind == "scroll":
            idx = add_input(["-loop", "1", "-framerate", "30", "-t", str(seg["dur"]), "-i", str(ROOT / seg["png"])])
            d, y0, y1 = seg["dur"], seg["y0"], seg["y1"]
            filters.append(
                f"[{idx}:v]crop=1080:1920:0:'{y0}+({y1}-{y0})*t/{d}',setsar=1,fps=30[{lab}]"
            )
            total += d
        else:
            raise SystemExit(f"unknown segment type {kind}")
        labels.append(f"[{lab}]")

    filters.append("".join(labels) + f"concat=n={len(labels)}:v=1:a=0[base]")

    cur = "base"
    for j, ov in enumerate(spec.get("overlays", [])):
        idx = add_input(["-loop", "1", "-framerate", "30", "-t", str(total + 1), "-i", str(ROOT / ov["png"])])
        nxt = f"o{j}"
        filters.append(
            f"[{cur}][{idx}:v]overlay=0:0:shortest=1:enable='between(t,{ov['start']},{ov['end']})'[{nxt}]"
        )
        cur = nxt

    end = spec.get("end")
    if end:
        idx = add_input(["-loop", "1", "-framerate", "30", "-t", str(end["dur"]), "-i", str(ROOT / end["png"])])
        filters.append(f"[{idx}:v]format=yuv420p,setsar=1,fps=30[end]")
        filters.append(f"[{cur}]format=yuv420p,setsar=1[main]")
        filters.append("[main][end]concat=n=2:v=1:a=0[v]")
    else:
        filters.append(f"[{cur}]format=yuv420p[v]")

    out = ROOT / spec["out"]
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-v", "error", "-y"]
    for args in inputs:
        cmd += args
    cmd += [
        "-filter_complex", ";".join(filters), "-map", "[v]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(out),
    ]
    subprocess.run(cmd, check=True)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=width,height,duration", "-of", "default=nw=1", str(out)],
        capture_output=True, text=True,
    )
    print(out.name, probe.stdout.replace("\n", " "), f"(planned main {total:.1f}s + end)")


if __name__ == "__main__":
    build(sys.argv[1])
