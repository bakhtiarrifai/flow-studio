# Shorts kit: series of 9:16 shorts from Flow Studio

How the 8-episode *Sirah Nabawiyah for kids* series (33 s YouTube Shorts) was made with Flow Studio, and the local
scripts that finish each episode for no credits. Flow Studio makes the stills, clips and narration; this kit makes the
cover, titles, backsound mix, subtitles and the 360p / 1080p exports.

| File | What it does |
|---|---|
| `build_ep.sh` | One episode: 1 s zoom-in cover with title card, 4 clips, narration, ducked backsound, burned-in subtitles. `RES=360` (default) or `RES=1080` |
| `title_overlay.py` | Title card: Comfortaa Bold, wrapped over 2–3 balanced lines, as large as fits, last line in warm yellow, soft dark gradient behind it. Also writes the thumbnail |
| `backsound.py` | Generates a loopable Middle-Eastern ambient bed (D Hijaz drone, oud-like plucks, soft duff). No samples, no API |

## Film folder

`build_ep.sh <film> "<title>"` reads `$FLOW_STUDIO_OUTPUT/<film>/` (default `~/flow-studio-out/<film>/`):

```
cover.jpg            9:16 still for the first second and the thumbnail
scene-01..04.mp4     clips for the 360p build
hd-01..04.mp4        upscaled clips for the 1080p build
vo_id.wav            narration
subs/en.srt          subtitles timed on the finished 33 s film (cover second included)
```

and writes `exports_360p/<film>_360p.mp4` or `exports_1080p/<film>_1080p.mp4`, each with `<film>_thumbnail.png`.

## Working order per episode

1. **Storyboard** (`flow_storyboard`): script, cast, and per scene the still prompt (`frame_prompt`) and the motion
   prompt. Keep the series' visual rule in `style`.
2. **Cast**: one full-body portrait per character (`flow_character`, or a free still). Use the saved portrait file
   as `reference_images` for every still of that character; that is what keeps faces consistent across scenes.
3. **Stills, free**: 4 scene keyframes + 1 cover per episode on Nano Banana, 9:16. Check them before any video.
   Fix anachronisms here (one take put a 7th-century companion in European plate armour).
4. **Clips, 8 credits each**: Omni Flash with `economy: "draft"` (360p, 8 s) from each still as `first_frame`.
   Do not pass `duration` for Omni Flash at 360p: it has no length choice and is always 8 s.
5. **Narration, free**: `flow_narrate` (voice `Leda` fits a child narrator). Aim for ~32 s. A script that reads
   longer than ~37 s sounds rushed when sped up; record it again with a style like *"very quick and energetic,
   almost no pauses"* instead (that brought 42 s down to 32 s, still natural).
6. **Subtitles**: write `subs/en.srt` in 5 cues (0–5, 5–12, 12–19.5, 19.5–26.5, 26.5–33 s works for 4 scenes).
   Write "(PBUH)" rather than "ﷺ": the ligature renders as an empty box in the burned-in subtitle font.
7. **Backsound**: `python3 backsound.py ~/flow-studio-out/audio_bg/islamic_oud_duff_loop.wav`.
8. **Build**: `./build_ep.sh ep05_abu_umair "Abu Umair & His Little Sparrow"`, then check frames at 0.7 s
   (cover/title), a subtitle and the last second.
9. **1080p**: `flow_download` each clip with `quality: "upscaled"` as `hd-0N`, then `RES=1080 ./build_ep.sh …`.
   Flow upscales a 720p clip to 1080p but a 360p clip only to 720p; lanczos covers the rest.

Cost of one episode this way: stills free, 4 clips × 8 = **32 credits**, everything else local and free.
Reusing clips that already exist in Flow (`flow_assets`, then `flow_download`) costs nothing.

## Lessons from production

- **Children + Flow's safety filter**: some clips of children came back as a *Failed* tile ("might violate our
  policies about … minors"), refunded. Rewording the motion prompt to say *"the animated character"* instead of
  *"the boy"* went through every time.
- **Verify downloads**: before this kit, a batch of downloads interrupted by a browser hiccup shifted files onto the
  wrong names (episode 8 got episode 7's clips). Flow Studio now tracks each download by its DevTools id. Still, after
  any batch, compare each `hd-0N` with `scene-0N`:
  `ffmpeg -ss 2 -i hd-01.mp4 -ss 2 -i scene-01.mp4 -filter_complex "[0:v]scale=180:320,format=gray[a];[1:v]scale=180:320,format=gray[b];[a][b]ssim" -frames:v 1 -f null -`
  The same clip scores ≥ 0.96; a different clip scored ~0.1.
- **Backsound level**: a bed at volume 0.12 sat 14 dB under the narration and its low drone was inaudible on phones.
  The mix now uses volume 0.6 with gentle sidechain ducking (threshold 0.10, ratio 2): bed ≈ −25 dB under a narration
  of ≈ −19 dB. Strong ducking (threshold 0.03, ratio 4) buried it again at −34 dB.
- **Title card size**: keep the title block within ~21 % of the height so it never covers a face near the top of the
  cover; the script picks 2–3 lines and avoids one-word orphan lines.
- **Fact-check the spec**: the episode 8 spec named Abdullah bin Zubair as the boy carrying news to Cave Thawr, but
  he was born after the Hijrah; the narrator was changed to Abdullah bin Abi Bakr. Check names and dates of a
  historical script before recording.
