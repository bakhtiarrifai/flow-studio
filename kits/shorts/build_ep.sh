#!/usr/bin/env bash
# Assembles one 9:16 short from a Flow Studio film folder, locally with FFmpeg (no credits):
#   1 s zoom-in cover with a title card + 4 clips, narration with a ducked backsound, burned-in subtitles.
#
# Usage: [RES=360|1080] build_ep.sh <film-folder-name> "<cover title>"
#
# The film folder (under $FLOW_STUDIO_OUTPUT, default ~/flow-studio-out) must hold:
#   cover.jpg             cover still (any 9:16 size)
#   scene-01..04.mp4      clips for RES=360   (flow_generate / flow_download original)
#   hd-01..04.mp4         clips for RES=1080  (flow_download quality "upscaled")
#   vo_id.wav             narration (flow_narrate); sped up slightly if it runs past the film
#   subs/en.srt           subtitles, timed on the finished 33 s film (cover included)
# Output: <out>/exports_<RES>p/<film>_<RES>p.mp4 and <film>_thumbnail.png
# Backsound: $BACKSOUND, default <out>/audio_bg/islamic_oud_duff_loop.wav (make one with backsound.py).
set -euo pipefail
KIT="$(cd "$(dirname "$0")" && pwd)"
OUTROOT="${FLOW_STUDIO_OUTPUT:-$HOME/flow-studio-out}"
cd "$OUTROOT"
EP="$1"; TITLE="$2"; RES="${RES:-360}"
BACKSOUND="${BACKSOUND:-audio_bg/islamic_oud_duff_loop.wav}"
FILM=33          # seconds: 1 s cover + 4 x 8 s clips
if [ "$RES" = 1080 ]; then W=1080; H=1920; CLIP=hd; BR=(-crf 20 -maxrate 8M -bufsize 16M); else W=360; H=640; CLIP=scene; BR=(-crf 23); fi
for f in "$EP/cover.jpg" "$EP/$CLIP-01.mp4" "$EP/$CLIP-02.mp4" "$EP/$CLIP-03.mp4" "$EP/$CLIP-04.mp4" "$EP/vo_id.wav" "$EP/subs/en.srt" "$BACKSOUND"; do
  [ -f "$f" ] || { echo "missing: $OUTROOT/$f" >&2; exit 1; }
done
OUTDIR="exports_${RES}p"; mkdir -p "$OUTDIR"
OUT="$OUTDIR/${EP}_${RES}p.mp4"
VO_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$EP/vo_id.wav")
# Fit the narration inside the film. Above ~1.15x it starts to sound rushed: re-record with a "speak fast" style instead.
TEMPO=$(python3 -c "print(max(1.0, round($VO_DUR/($FILM-0.4), 3)))")
CARD="$(mktemp --suffix=.png)"; trap 'rm -f "$CARD" "$EP/cover_hd.png"' EXIT
# The card is drawn at 768x1376 and scaled, so the line breaks are identical in the 360p and 1080p builds.
python3 "$KIT/title_overlay.py" "$TITLE" 768,1376 "$CARD" >/dev/null
ZW=$((W * 2)); ZH=$((H * 2))   # zoom from a 2x frame so the 1 s push-in stays smooth
clip() { echo "[$1:v]scale=$W:$H:force_original_aspect_ratio=increase:flags=lanczos,crop=$W:$H,fps=30,setsar=1[v$1];"; }
ffmpeg -y -v error \
  -framerate 30 -loop 1 -t 1 -i "$EP/cover.jpg" \
  -i "$EP/$CLIP-01.mp4" -i "$EP/$CLIP-02.mp4" -i "$EP/$CLIP-03.mp4" -i "$EP/$CLIP-04.mp4" \
  -i "$EP/vo_id.wav" -stream_loop -1 -i "$BACKSOUND" -i "$CARD" \
  -filter_complex "
    [0:v]scale=$ZW:$ZH:flags=lanczos,zoompan=z='min(1+0.0026*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,setsar=1[z0];
    [7:v]scale=$W:$H:flags=lanczos[t0];[z0][t0]overlay=0:0,setsar=1[v0];
    $(clip 1) $(clip 2) $(clip 3) $(clip 4)
    [v0][v1][v2][v3][v4]concat=n=5:v=1:a=0,tpad=stop_mode=clone:stop_duration=1,subtitles='$EP/subs/en.srt':force_style='FontName=Noto Sans,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=35,MarginL=18,MarginR=18'[vout];
    [5:a]atempo=$TEMPO,apad,asplit=2[vo][key];
    [6:a]volume=0.6[bgraw];
    [bgraw][key]sidechaincompress=threshold=0.10:ratio=2:attack=30:release=400[bg];
    [vo][bg]amix=inputs=2:duration=first:normalize=0[amix];
    [amix]atrim=0:$FILM,asetpts=N/SR/TB[aout]
  " -map "[vout]" -map "[aout]" -t $FILM \
  -c:v libx264 -preset medium "${BR[@]}" -r 30 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"
# Thumbnail: the cover at full size (1080x1920 for the HD set) with the same title card.
if [ "$RES" = 1080 ]; then
  ffmpeg -y -v error -i "$EP/cover.jpg" -vf "scale=1080:1920:flags=lanczos" "$EP/cover_hd.png"
  python3 "$KIT/title_overlay.py" "$TITLE" "$EP/cover_hd.png" "$OUTDIR/${EP}_thumbnail.png" >/dev/null
else
  python3 "$KIT/title_overlay.py" "$TITLE" "$EP/cover.jpg" "$OUTDIR/${EP}_thumbnail.png" >/dev/null
fi
echo "$OUTROOT/$OUT  (narration x$TEMPO)"
