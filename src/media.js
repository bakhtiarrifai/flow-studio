// Everything done locally with FFmpeg: last-frame grabs, narration clean-up and the final cut. No Flow credits.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { FFMPEG, FFPROBE, safeName } from "./config.js";

const exec = promisify(execFile);

export const FFMPEG_HINT =
  process.platform === "darwin" ? "brew install ffmpeg" : process.platform === "win32" ? "winget install Gyan.FFmpeg" : "sudo dnf install ffmpeg (or sudo apt install ffmpeg)";

async function ffmpeg(args) {
  try {
    await exec(FFMPEG, ["-hide_banner", "-y", ...args], { maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`FFmpeg is not installed (${FFMPEG_HINT}).`);
    throw new Error(`FFmpeg failed: ${String(err.stderr ?? err).trim().slice(-600)}`);
  }
}

export async function duration(file) {
  const { stdout } = await exec(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

async function probe(file) {
  let stdout;
  try {
    ({ stdout } = await exec(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file]));
  } catch {
    throw new Error(`"${basename(file)}" is not a playable video (an unfinished download, perhaps). Remove it from the cut or pick another clip.`);
  }
  const data = JSON.parse(stdout);
  const video = data.streams.find((s) => s.codec_type === "video");
  if (!video?.width) throw new Error(`"${basename(file)}" has no video stream.`);
  return { width: video.width, height: video.height, duration: Number(data.format.duration), hasAudio: data.streams.some((s) => s.codec_type === "audio") };
}

// The final frame of a clip, so the next shot can open exactly where this one ended.
export async function lastFrame(video) {
  const out = video.replace(/\.\w+$/, "") + "-lastframe.jpg";
  await ffmpeg(["-sseof", "-0.2", "-i", video, "-update", "1", "-q:v", "2", out]);
  return out;
}

const VOICE_CHAIN = "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11";

// Turns any speech recording (or raw PCM from a TTS service) into a level, 48 kHz stereo WAV.
export async function masterVoice(input, target, raw) {
  const source = raw ? ["-f", "s16le", "-ar", String(raw.rate), "-ac", "1", "-i", input] : ["-i", input];
  await ffmpeg([...source, "-vn", "-af", VOICE_CHAIN, "-ar", "48000", "-ac", "2", target]);
  return { output: target, duration: await duration(target) };
}

let h264;
async function videoEncoder() {
  if (h264) return h264;
  const { stdout } = await exec(FFMPEG, ["-hide_banner", "-encoders"]).catch(() => ({ stdout: "" }));
  // Some distributions ship FFmpeg without x264; OpenH264 is the usual stand-in.
  h264 = /\blibx264\b/.test(stdout) ? ["-c:v", "libx264", "-crf", "18", "-preset", "medium"] : /\blibopenh264\b/.test(stdout) ? ["-c:v", "libopenh264", "-b:v", "8M"] : ["-c:v", "mpeg4", "-q:v", "3"];
  return h264;
}

// Clips named scene-NN / clip-NN / edit-NN in numeric order, first take only; otherwise every mp4, oldest first.
function clipsIn(dir) {
  if (!existsSync(dir)) throw new Error(`There is no "${basename(dir)}" folder yet. Generate or download clips first, or list the clips to join.`);
  const files = readdirSync(dir).filter((f) => /\.mp4$/i.test(f));
  const numbered = new Map();
  for (const f of files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const key = f.match(/^((?:scene|clip|edit)-\d+)(-v\d+)?\.mp4$/i)?.[1];
    if (key && !numbered.has(key)) numbered.set(key, join(dir, f));
  }
  if (numbered.size) return [...numbered.values()];
  return files
    .filter((f) => !/^film|^final/i.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
    .map((x) => join(dir, x.f));
}

// Joins clips into one film. Each clip keeps its own sound at `clip_volume`; music loops underneath; the voiceover
// sits on top. With `hold_last_frame` the final frame is held until the narration has finished.
export async function cut({ dir, clips, voiceover, music, music_volume = 0.25, clip_volume = 1, output_name = "film", hold_last_frame = true }) {
  const output = join(dir, safeName(output_name).replace(/\.mp4$/i, "") + ".mp4");
  const list = (clips?.length ? clips : clipsIn(dir)).filter((c) => c !== output);
  if (!list.length) throw new Error(`No clips to join in ${dir}.`);
  for (const f of [...list, music, voiceover]) if (f && !existsSync(f)) throw new Error(`File not found: ${f}`);

  mkdirSync(dir, { recursive: true });
  const infos = await Promise.all(list.map(probe));
  const footage = infos.reduce((sum, i) => sum + i.duration, 0);
  const hold = voiceover && hold_last_frame ? Math.max(0, (await duration(voiceover)) + 0.6 - footage) : 0;
  const holding = hold > 0.05;
  // Size the film to the largest clip so one small clip cannot drag the rest down.
  const { width, height } = infos.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const volume = Math.min(1, Math.max(0, clip_volume));

  const args = list.flatMap((c) => ["-i", c]);
  const filters = [];
  infos.forEach((info, i) => {
    const last = holding && i === infos.length - 1;
    filters.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24` +
        `${last ? `,tpad=stop_mode=clone:stop_duration=${hold.toFixed(2)}` : ""}[v${i}]`,
    );
    filters.push(
      info.hasAudio
        ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${volume}${last ? `,apad=pad_dur=${hold.toFixed(2)}` : ""}[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${(info.duration + (last ? hold : 0)).toFixed(2)}[a${i}]`,
    );
  });
  filters.push(`${infos.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${list.length}:v=1:a=1[v][clips]`);

  const mix = ["[clips]"];
  let next = list.length;
  if (music) {
    args.push("-stream_loop", "-1", "-i", music);
    filters.push(`[${next++}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${music_volume}[music]`);
    mix.push("[music]");
  }
  if (voiceover) {
    args.push("-i", voiceover);
    filters.push(`[${next++}:a]aresample=48000,aformat=channel_layouts=stereo[vo]`);
    mix.push("[vo]");
  }
  filters.push(mix.length > 1 ? `${mix.join("")}amix=inputs=${mix.length}:duration=first:dropout_transition=0:normalize=0[a]` : "[clips]anull[a]");

  await ffmpeg([
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-map", "[a]",
    ...(await videoEncoder()), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    output,
  ]);
  return { output, clips: list, duration: Number((footage + hold).toFixed(2)), held_last_frame: Number(hold.toFixed(2)) };
}
