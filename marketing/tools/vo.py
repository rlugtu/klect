#!/usr/bin/env python3
"""Generate voiceover lines with the local Voicebox server (http://127.0.0.1:17493).
Usage: python3 tools/vo.py <profile_id> <out.wav> "line of text" [engine]
Voicebox must be running. Writes a wav and prints its duration in seconds.
"""
import json
import subprocess
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:17493"


def call(path, body=None, timeout=120):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=timeout).read()


def generate(profile_id: str, text: str, out: str, engine: str = "kokoro") -> float:
    gen = json.loads(call("/generate", {"profile_id": profile_id, "text": text, "language": "en", "engine": engine}))
    gid = gen["id"]
    for _ in range(90):
        raw = call(f"/generate/{gid}/status", timeout=30).decode()
        last = [l for l in raw.splitlines() if l.startswith("data:")][-1]
        st = json.loads(last[5:])
        if st["status"] == "completed":
            break
        if st["status"] in ("failed", "error"):
            raise SystemExit(f"generation failed: {st.get('error')}")
        time.sleep(1)
    else:
        raise SystemExit("timed out")
    audio = call(f"/history/{gid}/export-audio", timeout=60)
    open(out, "wb").write(audio)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                         capture_output=True, text=True).stdout.strip()
    return float(dur)


if __name__ == "__main__":
    profile, out, text = sys.argv[1], sys.argv[2], sys.argv[3]
    engine = sys.argv[4] if len(sys.argv) > 4 else "kokoro"
    print(out, f"{generate(profile, text, out, engine):.2f}s")
