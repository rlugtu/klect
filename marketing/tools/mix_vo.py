#!/usr/bin/env python3
"""Generate voiceover lines with Voicebox and mix them onto the silent ad videos.
Usage: python3 tools/mix_vo.py            (all videos)   or   python3 tools/mix_vo.py concept2-hookA
Needs Voicebox running (see tools/vo.py). Lines are cached in audio/lines/ by text hash.
Each line starts at its planned time, or right after the previous line ends (+0.12s) if it would overlap.
Output: build/<name>-vo.mp4 (video copied, AAC audio normalized to about -14 LUFS).
"""
import hashlib
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vo import generate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PROFILE = "ebd5fdd0-216f-4cd7-a30c-5d517c04cab4"  # "Eva" (Kokoro af_heart)
END_LINE = "Klect. Free to start on the App Store."
TEMPO = 1.15

# (planned start seconds on the video timeline, text)
VIDEOS = {
    "concept1-hookA": (20.0, [
        (0.15, "Watch this link turn into a full card."),
        (3.9, "Paste it, and Klect fills in the photo, the details, even the whole recipe."),
        (8.3, "Tag it. Rate it."),
        (12.3, "Now it's in your list, easy to find later."),
        (20.15, END_LINE)]),
    "concept1-hookB": (20.0, [
        (0.15, "Stop saving bare links."),
        (3.9, "Paste one into Klect, and it fills in the photo, the details, even the whole recipe."),
        (8.3, "Tag it. Rate it."),
        (12.3, "Now it's in your list, easy to find later."),
        (20.15, END_LINE)]),
    "concept2-hookA": (15.9, [
        (0.1, "Your saved posts are a graveyard."),
        (2.6, "Three hundred and forty saves. Can't find one."),
        (4.4, "One home for everything you save."),
        (6.9, "Photos, ratings, and tags."),
        (10.6, "One tap to find it."),
        (16.05, END_LINE)]),
    "concept2-hookB": (15.9, [
        (0.1, "Be honest. When did you last open your saves?"),
        (3.3, "Three hundred and forty saves. Can't find one."),
        (5.4, "One home for everything you save."),
        (7.9, "Photos, ratings, and tags."),
        (10.6, "One tap to find it."),
        (16.05, END_LINE)]),
    "concept5-hookA": (15.1, [
        (0.1, "Recipes in one app. Restaurants in another. Travel in a third."),
        (4.6, "Or keep it all in one place. Tagged, rated, findable."),
        (9.8, "If it's worth remembering, it's here."),
        (15.25, END_LINE)]),
    "concept5-hookB": (15.1, [
        (0.1, "Why is your saved stuff in five apps?"),
        (4.0, "Or keep it all in one place. Tagged, rated, findable."),
        (9.8, "If it's worth remembering, it's here."),
        (15.25, END_LINE)]),
}


def line_wav(text: str) -> Path:
    d = ROOT / "audio" / "lines"
    d.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(text.encode()).hexdigest()[:12]
    p = d / (h + ".wav")
    if not p.exists():
        generate(PROFILE, text, str(p))
    # Kokoro reads a bit slow for short-form video: speed up 15%, pitch preserved.
    fast = d / (h + f"_t{int(TEMPO * 100)}.wav")
    if not fast.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(p), "-filter:a", f"atempo={TEMPO}", str(fast)], check=True)
    return fast


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out)


def mix(name: str) -> None:
    _main_len, lines = VIDEOS[name]
    video = ROOT / "build" / f"{name}.mp4"
    total = duration(video)
    inputs, filters, labels = [], [], []
    prev_end = 0.0
    for i, (start, text) in enumerate(lines):
        wav = line_wav(text)
        dur = duration(wav)
        begin = max(start, prev_end + 0.12 if i else 0.0)
        if begin > start + 0.01:
            print(f"  note: line {i + 1} pushed {begin - start:.2f}s later (previous line runs long)")
        prev_end = begin + dur
        if prev_end > total:
            print(f"  warn: line {i + 1} ends {prev_end - total:.2f}s after the video ({text[:30]})")
        inputs += ["-i", str(wav)]
        ms = int(begin * 1000)
        filters.append(f"[{i + 1}:a]adelay={ms}|{ms},apad[a{i}]")
        labels.append(f"[a{i}]")
    filters.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest,"
                   f"atrim=0:{total},loudnorm=I=-14:TP=-1.5:LRA=9[aout]")
    out = ROOT / "build" / f"{name}-vo.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(video), *inputs, "-filter_complex", ";".join(filters),
           "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
           "-shortest", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    print(f"{out.name}: {duration(out):.1f}s (video {total:.1f}s), last line ends {prev_end:.1f}s")


if __name__ == "__main__":
    names = sys.argv[1:] or list(VIDEOS)
    for n in names:
        mix(n)
