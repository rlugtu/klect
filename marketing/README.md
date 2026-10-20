# Klect ad videos

Faceless short-form ads (TikTok and Instagram Reels). Owned by the `klect-video-editor` agent; the style contract and history live in the vault notes Klect Video Style and Klect Video Log (Brain/10 - Klect).

```
raw/              simulator screen recordings (large, not in git). *-cfr.mp4 are constant-frame-rate copies.
specs/            one JSON per video: segments, overlays, end card (tools/build.py reads these)
specs/clean/      the same specs without baked text, used for the Resolve base video
build/            ffmpeg outputs and scratch assets (silent cuts, text PNGs, mask)
audio/lines/      cached Voicebox voiceover lines (by text hash)
audio/auditions/  voice audition clips
resolve/media/<video>/   base.mp4, vo.wav, captions.mov, captions.json, lines.json (inputs for Resolve)
resolve/scripts/  build_<video>.lua and build_all.lua (run in Resolve: Workspace > Console > dofile('<path>'))
final/<video>/    renders from Resolve
tools/            build.py, captions.swift, scenes.swift, maketext.swift, endcard.swift, vo.py, mix_vo.py, prep_resolve.py
```

Workflow: record in the simulator, write `specs/<video>.json`, `python3 tools/build.py specs/<video>.json`, edit the line table in `tools/mix_vo.py`, `python3 tools/prep_resolve.py <video>`, then in Resolve run `dofile('.../resolve/scripts/build_<video>.lua')`. Resolve project: "Klect Ads".
