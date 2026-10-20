#!/usr/bin/env python3
"""Prepare everything DaVinci Resolve needs to assemble and render one Klect ad.
Usage: python3 tools/prep_resolve.py concept1-hookA [concept2-hookB ...]   (no args = all videos)

For each video writes resolve/media/<name>/:
  base.mp4        clean 9:16 video (screen recordings + end card, no text) built from specs/<name>.json
  vo.wav          voiceover track (lines from tools/mix_vo.py, timed, normalized to about -14 LUFS)
  lines.json      where each voiceover line starts and ends
  captions.json   word-timed caption chunks (first line = headline style, rest = lower-third captions)
  captions.mov    transparent ProRes 4444 caption layer rendered by tools/captions.swift
and resolve/scripts/build_<name>.lua, which builds the timeline in the "Klect Ads" Resolve project and
queues the render into final/<name>/. Run that script from Resolve's console with dofile('<path>').
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mix_vo  # noqa: E402  (line table, Voicebox line cache, tempo)

ROOT = Path(__file__).resolve().parent.parent
FPS = 30
HIGHLIGHT_LINGER = 0.30  # seconds a chunk stays after its last word


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def probe_duration(path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out)


def speech_window(wav: Path) -> tuple[float, float]:
    """Start and end of actual speech inside a line's wav (trims the silence Kokoro leaves around it)."""
    dur = probe_duration(wav)
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", "silencedetect=noise=-38dB:d=0.05",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    s, e = 0.0, dur
    if starts and starts[0] < 0.03 and ends:
        s = ends[0]
    if starts and (len(ends) < len(starts) or ends[-1] >= dur - 0.03) and starts[-1] > s:
        e = starts[-1]
    return s, e


def word_weight(w: str) -> float:
    letters = re.sub(r"[^A-Za-z0-9]", "", w)
    syll = max(1, len(re.findall(r"[aeiouy]+", letters.lower())))
    weight = 0.6 * len(letters) + 1.4 * syll
    if re.search(r"[.?!]$", w):
        weight += 2.0  # sentence-final pause
    elif re.search(r",$", w):
        weight += 1.0
    return weight


def place_lines(name: str):
    """Same placement rule as mix_vo.mix(): planned start, pushed later if the previous line is still talking."""
    _main_len, lines = mix_vo.VIDEOS[name]
    placed, prev_end = [], 0.0
    for i, (start, text) in enumerate(lines):
        wav = mix_vo.line_wav(text)
        dur = mix_vo.duration(wav)
        begin = max(start, prev_end + 0.12 if i else 0.0)
        prev_end = begin + dur
        placed.append({"i": i, "text": text, "wav": str(wav), "begin": round(begin, 3), "dur": round(dur, 3)})
    return placed


def word_times(placed):
    words_by_line = []
    for ln in placed:
        s, e = speech_window(Path(ln["wav"]))
        toks = ln["text"].split()
        weights = [word_weight(t) for t in toks]
        total = sum(weights)
        t = ln["begin"] + s
        span = e - s
        ws = []
        for tok, wgt in zip(toks, weights):
            d = span * wgt / total
            ws.append({"t": tok, "s": round(t, 3), "e": round(t + d, 3)})
            t += d
        ln["speech"] = [round(ln["begin"] + s, 3), round(ln["begin"] + e, 3)]
        words_by_line.append(ws)
    return words_by_line


def chunk_words(words_by_line, lines=None):
    chunks = []
    for li, words in enumerate(words_by_line):
        if lines and lines[li]["text"] == mix_vo.END_LINE:
            continue  # the end card already shows this line in text
        style = "headline" if li == 0 else "caption"
        limit = 3
        cur = []
        for w in words:
            cur.append(w)
            sentence_end = bool(re.search(r"[.?!]$", w["t"]))
            comma = bool(re.search(r",$", w["t"])) and len(cur) >= 2
            if len(cur) >= limit or sentence_end or comma:
                chunks.append({"style": style, "words": cur})
                cur = []
        if cur:
            chunks.append({"style": style, "words": cur})
    for i, c in enumerate(chunks):
        c["start"] = c["words"][0]["s"]
        nxt = chunks[i + 1]["words"][0]["s"] if i + 1 < len(chunks) else 1e9
        c["end"] = round(min(c["words"][-1]["e"] + HIGHLIGHT_LINGER, nxt), 3)
    return chunks


def prep(name: str):
    media = ROOT / "resolve" / "media" / name
    media.mkdir(parents=True, exist_ok=True)
    (ROOT / "resolve" / "scripts").mkdir(parents=True, exist_ok=True)
    (ROOT / "final" / name).mkdir(parents=True, exist_ok=True)

    # 1. clean base video: same spec as the ffmpeg build, minus the baked text overlays
    spec = json.loads((ROOT / "specs" / f"{name}.json").read_text())
    spec["overlays"] = []
    spec["out"] = f"resolve/media/{name}/base.mp4"
    clean_dir = ROOT / "specs" / "clean"
    clean_dir.mkdir(exist_ok=True)
    clean = clean_dir / f"{name}.json"
    clean.write_text(json.dumps(spec, indent=1))
    sh([sys.executable, str(ROOT / "tools" / "build.py"), str(clean)], stdout=subprocess.DEVNULL)
    total = probe_duration(media / "base.mp4")

    # 2. voiceover track and word timings
    placed = place_lines(name)
    words_by_line = word_times(placed)
    chunks = chunk_words(words_by_line, placed)
    inputs, filters, labels = [], [], []
    for ln in placed:
        inputs += ["-i", ln["wav"]]
        ms = int(ln["begin"] * 1000)
        filters.append(f"[{ln['i']}:a]adelay={ms}|{ms},apad[a{ln['i']}]")
        labels.append(f"[a{ln['i']}]")
    filters.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest,atrim=0:{total:.3f},"
                   "loudnorm=I=-14:TP=-1.5:LRA=9[aout]")
    sh(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[aout]",
        "-ar", "48000", "-ac", "2", str(media / "vo.wav")])
    (media / "lines.json").write_text(json.dumps(placed, indent=1))
    (media / "captions.json").write_text(json.dumps({"fps": FPS, "duration": round(total, 3), "chunks": chunks}, indent=1))

    # 3. caption layer: PNG sequence -> transparent ProRes 4444
    scratch = Path(tempfile.mkdtemp(prefix=f"cap_{name}_", dir=os.environ.get("KLECT_SCRATCH") or None))
    try:
        sh(["swift", str(ROOT / "tools" / "captions.swift"), str(media / "captions.json"), str(scratch)],
           stdout=subprocess.DEVNULL)
        sh(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(scratch / "%05d.png"),
            "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0",
            str(media / "captions.mov")])
    finally:
        shutil.rmtree(scratch, ignore_errors=True)

    # 4. Resolve build script
    frames = round(total * FPS)
    lua = LUA_TEMPLATE.format(name=name, media=media, out=ROOT / "final" / name, frames=frames)
    (ROOT / "resolve" / "scripts" / f"build_{name}.lua").write_text(lua)
    print(f"{name}: base {total:.1f}s, {len(chunks)} caption chunks, vo + captions ready, lua written")


LUA_TEMPLATE = r'''-- Auto-generated by tools/prep_resolve.py. Run in Resolve: Workspace > Console, then
--   dofile('/Users/ryan/Documents/eva/klect/marketing/resolve/scripts/build_{name}.lua')
local NAME = "{name}"
local DIR = "{media}"
local OUT = "{out}"
local FRAMES = {frames}
local PROJECT = "Klect Ads"

local pm = resolve:GetProjectManager()
local proj = pm:GetCurrentProject()
if not proj or proj:GetName() ~= PROJECT then
  if proj then pm:SaveProject() end
  proj = pm:LoadProject(PROJECT)
  if not proj then proj = pm:CreateProject(PROJECT) end
end
if not proj then print("ERROR: could not open or create project " .. PROJECT) return end

proj:SetSetting("timelineResolutionWidth", "1080")
proj:SetSetting("timelineResolutionHeight", "1920")
proj:SetSetting("timelineFrameRate", "30")
proj:SetSetting("timelinePlaybackFrameRate", "30")

local mp = proj:GetMediaPool()
local root = mp:GetRootFolder()
local folder = nil
for _, f in ipairs(root:GetSubFolderList() or {{}}) do
  if f:GetName() == NAME then folder = f end
end
if not folder then folder = mp:AddSubFolder(root, NAME) end
mp:SetCurrentFolder(folder)

local imported = mp:ImportMedia({{DIR .. "/base.mp4", DIR .. "/captions.mov", DIR .. "/vo.wav"}})
local base, caps, vo
for _, it in ipairs(imported or {{}}) do
  local fn = it:GetClipProperty("File Name")
  if fn == "base.mp4" then base = it elseif fn == "captions.mov" then caps = it elseif fn == "vo.wav" then vo = it end
end
if not (base and caps and vo) then print("ERROR: import failed", base, caps, vo) return end

local tlName = NAME
for i = 1, proj:GetTimelineCount() do
  if proj:GetTimelineByIndex(i):GetName() == tlName then tlName = NAME .. " v" .. os.date("%H%M%S") end
end
local tl = mp:CreateEmptyTimeline(tlName)
if not tl then print("ERROR: CreateEmptyTimeline failed") return end
proj:SetCurrentTimeline(tl)
tl:SetSetting("useCustomSettings", "1")
tl:SetSetting("timelineResolutionWidth", "1080")
tl:SetSetting("timelineResolutionHeight", "1920")
tl:SetSetting("timelineFrameRate", "30")
tl:AddTrack("video")

local start = tl:GetStartFrame()
local ok1 = mp:AppendToTimeline({{{{mediaPoolItem = base, mediaType = 1, trackIndex = 1, startFrame = 0, endFrame = FRAMES - 1, recordFrame = start}}}})
local ok2 = mp:AppendToTimeline({{{{mediaPoolItem = caps, mediaType = 1, trackIndex = 2, startFrame = 0, endFrame = FRAMES - 1, recordFrame = start}}}})
local ok3 = mp:AppendToTimeline({{{{mediaPoolItem = vo, mediaType = 2, trackIndex = 1, recordFrame = start}}}})
print("timeline " .. tlName .. " start=" .. start .. " end=" .. tl:GetEndFrame() .. " base/caps/vo appended: " .. tostring(ok1 ~= nil) .. "/" .. tostring(ok2 ~= nil) .. "/" .. tostring(ok3 ~= nil))
print("V1 clips=" .. #(tl:GetItemListInTrack("video", 1) or {{}}) .. " V2 clips=" .. #(tl:GetItemListInTrack("video", 2) or {{}}) .. " A1 clips=" .. #(tl:GetItemListInTrack("audio", 1) or {{}}))

local fmt = proj:SetCurrentRenderFormatAndCodec("mp4", "H264")
local set = proj:SetRenderSettings({{
  SelectAllFrames = true, TargetDir = OUT, CustomName = NAME, ExportVideo = true, ExportAudio = true,
  FormatWidth = 1080, FormatHeight = 1920, FrameRate = 30, AudioCodec = "aac", AudioBitDepth = 16, AudioSampleRate = 48000,
}})
local job = proj:AddRenderJob()
print("render format set=" .. tostring(fmt) .. " settings=" .. tostring(set) .. " job=" .. tostring(job))
if job and not SKIP_RENDER_START then
  proj:StartRendering(job)
  print("rendering started -> " .. OUT .. "/" .. NAME .. ".mp4")
elseif job then
  print("render job queued -> " .. OUT .. "/" .. NAME .. ".mp4")
end
'''

def write_build_all(names):
    lines = ["-- Auto-generated by tools/prep_resolve.py: builds every timeline in the Klect Ads project, queues one",
             "-- render job per video, then starts all renders. Run: dofile('%s')" % (ROOT / "resolve" / "scripts" / "build_all.lua"),
             "SKIP_RENDER_START = true"]
    for n in names:
        lines.append("dofile('%s')" % (ROOT / "resolve" / "scripts" / f"build_{n}.lua"))
    lines += ["SKIP_RENDER_START = nil",
              "local p = resolve:GetProjectManager():GetCurrentProject()",
              "print('all timelines built, starting ' .. #(p:GetRenderJobList() or {}) .. ' render jobs')",
              "p:StartRendering()"]
    (ROOT / "resolve" / "scripts" / "build_all.lua").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    names = sys.argv[1:] or list(mix_vo.VIDEOS)
    for n in names:
        prep(n)
    write_build_all(list(mix_vo.VIDEOS))
