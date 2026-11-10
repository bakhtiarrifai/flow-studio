// Everything done locally with FFmpeg: last-frame grabs, narration clean-up and the final cut. No Flow credits.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { FFMPEG, FFPROBE, safeName } from "./config.js";

const exec = promisify(execFile);

export const FFMPEG_HINT =
  process.platform === "darwin" ? "brew install ffmpeg" : process.platform === "win32" ? "winget install Gyan.FFmpeg" : "sudo dnf install ffmpeg (or sudo apt install ffmpeg)";

async function ffmpeg(args) {
  try {
    return await exec(FFMPEG, ["-hide_banner", "-y", ...args], { maxBuffer: 32 * 1024 * 1024 });
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
    ({ stdout } = await exec(FFPROBE, [
      "-v", "error",
      "-show_entries", "stream=codec_type,width,height,duration,r_frame_rate:format=duration",
      "-of", "json",
      file,
    ]));
  } catch {
    throw new Error(`"${basename(file)}" is not a playable video (an unfinished download, perhaps). Remove it from the cut or pick another clip.`);
  }
  const data = JSON.parse(stdout);
  const video = data.streams.find((s) => s.codec_type === "video");
  if (!video?.width) throw new Error(`"${basename(file)}" has no video stream.`);
  let fps = 24;
  if (video.r_frame_rate) {
    const [num, den] = video.r_frame_rate.split("/").map(Number);
    if (den && num) fps = Math.round(num / den);
  }
  const dur = Number(video.duration || data.format?.duration);
  return {
    width: video.width,
    height: video.height,
    duration: dur,
    fps,
    hasAudio: data.streams.some((s) => s.codec_type === "audio"),
  };
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

// ---------------------------------------------------------------- motion control

const CLIP_LENGTHS = [4, 6, 8, 10];
const MAX_SEGMENTS = 50;

// Times where the shot changes. Motion cannot carry across a cut, so the plan warns about them.
async function shotChanges(video) {
  const { stderr } = await ffmpeg(["-i", video, "-map", "0:v:0", "-vf", "select='gt(scene,0.4)',showinfo", "-f", "null", "-"]);
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(Number(m[1]).toFixed(2)));
}

// Splits a performance video into short reference clips and grabs the pose at every boundary. Local and free.
// Flow clips come in fixed lengths, so each segment records the length to order and motionJoin retimes it back.
export async function motionPlan({ video, dir, segment_seconds }) {
  if (!existsSync(video)) throw new Error(`File not found: ${video}`);
  const { duration: total, hasAudio, fps = 30 } = await probe(video);
  if (!Number.isFinite(total) || total <= 0) throw new Error(`Could not read the length of "${basename(video)}".`);
  const count = Math.ceil(total / segment_seconds);
  if (count > MAX_SEGMENTS) throw new Error(`${count} segments is more than the ${MAX_SEGMENTS} one flow_generate call can queue. Use a longer segment_seconds or a shorter video.`);

  const folder = join(dir, "motion");
  mkdirSync(folder, { recursive: true });
  const seconds = total / count;
  const clipLength = CLIP_LENGTHS.find((l) => l >= seconds);
  const at = (i) => Number((i * seconds).toFixed(3));
  const encoder = await videoEncoder();

  const poses = [];
  for (let i = 0; i <= count; i++) {
    const pose = join(folder, `pose-${String(i + 1).padStart(2, "0")}.jpg`);
    // The very end of a file holds no frame to seek to, so the last pose is taken just before it.
    await ffmpeg(["-ss", String(Math.min(at(i), Math.max(0, total - 0.1))), "-i", video, "-frames:v", "1", "-update", "1", "-q:v", "2", pose]);
    poses.push(pose);
  }

  const segments = [];
  for (let i = 0; i < count; i++) {
    const reference_clip = join(folder, `chunk-${String(i + 1).padStart(2, "0")}.mp4`);
    await ffmpeg(["-ss", String(at(i)), "-i", video, "-t", String(Number(seconds.toFixed(3))), "-map", "0:v:0", "-an", ...encoder, "-pix_fmt", "yuv420p", reference_clip]);
    segments.push({ index: i + 1, start: at(i), end: at(i + 1), seconds: Number(seconds.toFixed(3)), clip_duration: clipLength, reference_clip, pose_start: poses[i], pose_end: poses[i + 1] });
  }

  // Read from a decoded frame: phone videos store portrait footage as landscape plus a rotation flag.
  const frame = await probe(poses[0]);
  const cuts = await shotChanges(video);
  const plan = { source: video, source_has_audio: hasAudio, duration: Number(total.toFixed(3)), fps, aspect_ratio: frame.height > frame.width ? "9:16" : "16:9", cuts, poses, segments };
  const path = join(folder, "plan.json");
  writeFileSync(path, JSON.stringify(plan, null, 2));
  return { plan: path, ...plan };
}

// Joins the clips made from a plan, retiming each to the length of its segment so the performance keeps its timing.
// The clips' own sound is dropped because retiming ruins it; the source video's sound can replace it.
export async function motionJoin({ dir, plan: path, clips, source_audio, output_name }) {
  if (!existsSync(path)) throw new Error(`No motion plan at ${path}. Call flow_motion_plan first.`);
  const plan = JSON.parse(readFileSync(path, "utf8"));
  if (clips.length !== plan.segments.length) throw new Error(`The plan has ${plan.segments.length} segments but ${clips.length} clips were given. Give one clip per segment, in order.`);
  for (const f of clips) if (!existsSync(f)) throw new Error(`File not found: ${f}`);
  const infos = await Promise.all(clips.map(probe));
  const { width, height } = infos.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const targetFps = plan.fps || 30;

  const filters = infos.map((info, i) => {
    const stretch = plan.segments[i].seconds / info.duration;
    return `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=(PTS-STARTPTS)*${stretch.toFixed(5)},fps=${targetFps}[v${i}]`;
  });
  filters.push(`${infos.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[v]`);

  const withAudio = source_audio && plan.source_has_audio && existsSync(plan.source);
  const output = join(dir, safeName(output_name).replace(/\.mp4$/i, "") + ".mp4");
  await ffmpeg([
    ...clips.flatMap((c) => ["-i", c]),
    ...(withAudio ? ["-i", plan.source] : []),
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    ...(withAudio ? ["-map", `${clips.length}:a:0`, "-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
    ...(await videoEncoder()), "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    output,
  ]);
  return { output, duration: await duration(output), source_audio: Boolean(withAudio) };
}
