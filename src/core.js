// The operations behind both the MCP tools and the control panel, plus the job queue that keeps Flow to one task at a time.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { DEFAULT_MAX_CREDITS, OUT, PAUSE_MAX_S, PAUSE_MIN_S, UPLOAD_DIR, projectDir, safeName } from "./config.js";
import * as flow from "./flow.js";
import { cut, duration, lastFrame } from "./media.js";
import { GOOGLE_VOICES, LOCAL_VOICE_HINT, googleKey, localVoices, saveGoogleKey, speakLocally, speakWithGoogle } from "./narrate.js";
import { TECHNIQUES, techniqueById } from "./techniques.js";

// ---------------------------------------------------------------- argument shapes

const project = z.string().min(1).default("untitled").describe("Folder name for this film's files under the output directory.");
const quality = z.enum(["original", "upscaled"]).default("original").describe("'upscaled' asks Flow for its free upscale (1080p video / 2K stills) where the plan allows it; slower.");

const scene = z.object({
  prompt: z.string().min(1).describe("One continuous shot, in English: subject and action, shot size and camera move, location, style, light, sound."),
  type: z.enum(["video", "image"]).default("video").describe("Stills are free on Flow's default image model; get them right before paying for video."),
  model: z.string().optional().describe("Model name as Flow shows it, e.g. 'Omni Flash', 'Veo 3.1 - Fast', 'Nano Banana'. Omit to keep whatever Flow has selected."),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).optional().describe("Video supports 16:9 and 9:16."),
  duration: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]).optional().describe("Clip length in seconds, for models that allow a choice."),
  resolution: z.enum(["360p", "720p"]).optional(),
  variants: z.number().int().min(1).max(4).default(1).describe("Takes to generate. Each take is charged."),
  first_frame: z.string().optional().describe("Opening frame: an absolute file path, or 'asset:<title>' for something already in the Flow project."),
  last_frame: z.string().optional().describe("Closing frame the clip must land on: a file path or 'asset:<title>'."),
  reference_images: z.array(z.string()).max(3).optional().describe("Up to 3 look references: file paths, or 'asset:<character name>' to keep a character on-model. Ignored when frames are set (Flow allows one or the other)."),
  chain_previous: z.boolean().default(false).describe("Open this clip on the real last frame of the previous scene in this call (an exact join)."),
  chain_from: z.string().optional().describe("Open this clip on the last frame of this local video file (an exact join with an earlier clip)."),
  technique: z.string().optional().describe("Id of a preset from flow_techniques; its direction line is added to the prompt."),
  max_credits: z.number().min(0).default(DEFAULT_MAX_CREDITS).describe("Spending limit for this scene. Flow's own quote is read first; over the limit, nothing is generated."),
  download_quality: quality,
});

export const shapes = {
  status: {},
  generate: {
    project,
    scenes: z.array(scene).min(1).max(50).describe("Scenes in running order. Send a whole sequence in one call so numbering and chain_previous work."),
    start_number: z.number().int().min(1).optional().describe("First file number. Defaults to the next free number in the project folder."),
  },
  wait: {
    job_ids: z.array(z.string()).optional().describe("Jobs to wait for. Omit to wait for everything queued."),
    timeout_seconds: z.number().min(1).max(600).default(40),
  },
  cancel: { job_id: z.string() },
  retry: { job_ids: z.array(z.string()).optional().describe("Failed jobs to queue again. Omit for all failed jobs.") },
  assets: {},
  download: {
    name: z.string().min(1).describe("Start of the item's title in Flow, as listed by flow_assets."),
    project,
    file_name: z.string().optional().describe("File name without extension. Defaults to clip-NN."),
    quality,
  },
  trash: {
    name: z.string().min(1).describe("Exact title of the item in Flow."),
    confirmed: z.literal(true).describe("Set only after the user has agreed to trash this exact item. Flow itself asks for no confirmation."),
  },
  character: {
    name: z.string().min(1),
    describe: z.string().optional().describe("What the character looks like. Flow draws the portrait (free). Describe exactly one figure."),
    image: z.string().optional().describe("Build the character from a picture instead: a file path or 'asset:<title>'."),
    personality: z.string().optional(),
    voice: z.string().optional().describe("One of Flow's stock voice names."),
    aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).optional().describe("Portrait shape. Default 3:4."),
  },
  character_edit: {
    name: z.string().min(1),
    look: z.string().optional().describe("The change, e.g. 'make his coat red, keep everything else the same'. Omit to just save the current portrait to disk."),
  },
  characters: {},
  restyle: {
    asset: z.string().min(1).describe("Start of the clip's title in Flow."),
    prompt: z.string().min(1).describe("The change: relight, weather, background, remove an object."),
    project,
    confirmed: z.literal(true).describe("Set only after the user has agreed to the cost. Flow shows no price beforehand; an edit has cost more than a new clip."),
    download_quality: quality,
  },
  techniques: { category: z.enum(["camera", "transition", "product", "image"]).optional() },
  voices: {},
  narrate: {
    text: z.string().min(1).describe("The words to speak."),
    engine: z.enum(["google", "local"]).default("google").describe("'google' = Google AI Studio text-to-speech (free key, natural voices). 'local' = a voice installed on this computer, no key."),
    voice: z.string().optional().describe("Voice name from flow_voices. Defaults to Charon (google) or the first local voice."),
    style: z.string().optional().describe("google only: one short line on how to read it, e.g. 'warmly and unhurried, like a bedtime story'. Keep it short."),
    project,
    file_name: z.string().default("narration"),
  },
  cut: {
    project,
    clips: z.array(z.string()).optional().describe("Video files in playing order (absolute, or relative to the project folder). Omit to join the project's scene clips in number order."),
    voiceover: z.string().optional().describe("Narration file laid over the film."),
    music: z.string().optional().describe("Music file, looped under the film."),
    music_volume: z.number().min(0).max(2).default(0.25),
    clip_volume: z.number().min(0).max(1).default(1).describe("Volume of the clips' own sound. Lower it under a narration."),
    hold_last_frame: z.boolean().default(true).describe("If the narration outlasts the footage, hold the final frame until it ends. Better: generate enough footage and set this false."),
    output_name: z.string().default("film"),
  },
  // Panel only: these are deliberately not MCP tools.
  set_key: { key: z.string().min(1) },
  outputs: {},
  discard: { path: z.string().min(1) },
};

const PLAYBOOK = {
  order_of_work: [
    "Ask the user up front: the story, the shape (16:9 or 9:16), the credit budget, and the narrator voice.",
    "Call flow_status first. If it returns a hint, relay it and stop.",
    "Cast: create each recurring character once with flow_character and show the portrait before going on.",
    "Frames: describe the key stills, then generate them as images (free). Fix problems here, before any video.",
    "Narration: write and record it early with flow_narrate; its length says how much footage the film needs.",
    "Shots: state the expected credit total and get agreement, then send all shots in one flow_generate call.",
    "Call flow_wait until finished is true. Then flow_cut joins clips and narration locally, for no credits.",
  ],
  continuity: [
    "first_frame + last_frame: the clip animates from one still to the other, so the key stills decide where each shot lands.",
    "chain_previous: the clip opens on the real last frame of the previous one. An exact join; best for a straight continuation.",
    "reference_images with asset:<character>: locks the character but not the surroundings. Use it when the next shot moves to a new place.",
    "Flow takes frames or references in one clip, never both. With an exact join the next clip only knows the character from that last frame, so make sure the face is clearly visible in it.",
  ],
  prompts: [
    "One shot and one camera move per scene. Name the camera behaviour explicitly, or pass a technique id.",
    "Flow remembers nothing between scenes: restate a recurring character's full look in every prompt (flow_characters returns it).",
    "Put spoken lines in quotes, say who speaks, and keep the line short enough for the clip.",
  ],
  money: [
    "Stills on Flow's default image model cost nothing. Video costs credits per clip and per take.",
    "Every scene has max_credits. Flow's own quote is read before generating and the scene is skipped if it is over.",
    "A clip that was generated but did not download is still in Flow: fetch it with flow_download. Never generate it again.",
    "flow_restyle has no quote beforehand and has cost more than a new clip. Always get the user's agreement first.",
  ],
};

// ---------------------------------------------------------------- files

function listFiles(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => pattern.test(f));
}

function nextNumber(dir, prefix) {
  const used = listFiles(dir, new RegExp(`^${prefix}-\\d+`)).map((f) => Number(f.match(/\d+/)[0]));
  return used.length ? Math.max(...used) + 1 : 1;
}

const numbered = (prefix, n) => `${prefix}-${String(n).padStart(2, "0")}`;
const insideDir = (file, dir) => resolve(file).startsWith(resolve(dir) + sep);
const inProject = (dir, file) => (isAbsolute(file) ? file : join(dir, file));

const KIND = { ".mp4": "video", ".webm": "video", ".mov": "video", ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image", ".wav": "audio", ".mp3": "audio", ".m4a": "audio" };

function moveToTrash(target) {
  if (process.platform === "win32") {
    // The Recycle Bin has no folder to move into. The path travels in an environment variable, so nothing is quoted into the script.
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:FLOW_STUDIO_TARGET, 'OnlyErrorDialogs', 'SendToRecycleBin')"], {
      env: { ...process.env, FLOW_STUDIO_TARGET: target },
      stdio: "ignore",
    });
    return;
  }
  try {
    if (process.platform === "darwin") throw new Error("no gio");
    execFileSync("gio", ["trash", target], { stdio: "ignore" });
  } catch {
    const bin = process.platform === "darwin" ? join(homedir(), ".Trash") : join(homedir(), ".local", "share", "Trash", "files");
    mkdirSync(bin, { recursive: true });
    renameSync(target, join(bin, `${Date.now()}-${basename(target)}`));
  }
}

// ---------------------------------------------------------------- the studio

const PACED = new Set(["generate", "character", "character_edit", "restyle"]);
const RUNNERS = { generate: flow.generate, character: flow.createCharacter, character_edit: flow.editCharacter, restyle: flow.restyle };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export class Studio {
  jobs = new Map();
  working = false;
  lastPaced = 0;
  pacing = null;
  direct = 0;
  lastCredits = undefined;

  // ---- queue

  enqueue(kind, params, label) {
    const job = { id: randomUUID().slice(0, 8), kind, label, status: "queued", params, files: [], attempts: 0, created: new Date().toISOString() };
    this.jobs.set(job.id, job);
    void this.work();
    return job;
  }

  get running() {
    return [...this.jobs.values()].find((j) => j.status === "running");
  }

  view(job) {
    const { id, kind, label, status, files, credits, progress, note, error, flow_titles } = job;
    return { id, kind, label, status, files, credits, progress, note, error, flow_titles };
  }

  async work() {
    if (this.working) return;
    this.working = true;
    try {
      for (;;) {
        const job = [...this.jobs.values()].find((j) => j.status === "queued");
        if (!job) return;
        if (PACED.has(job.kind) && this.lastPaced) {
          const wait = this.lastPaced + (PAUSE_MIN_S + Math.random() * (PAUSE_MAX_S - PAUSE_MIN_S)) * 1000 - Date.now();
          if (wait > 0) {
            this.pacing = `next generation in about ${Math.ceil(wait / 1000)} s`;
            await pause(wait);
            this.pacing = null;
          }
        }
        // A quick panel or status action may be using the Flow tab; the job starts once it has let go.
        while (this.direct) await pause(300);
        if (job.status !== "queued") continue;
        job.status = "running";
        job.attempts++;
        job.error = undefined;
        try {
          job.files = await this.run(job);
          job.status = "done";
        } catch (err) {
          // Never retried automatically: a job that timed out may still have spent credits.
          job.status = "failed";
          job.error = err instanceof Error ? err.message : String(err);
        }
        job.progress = undefined;
        job.finished = new Date().toISOString();
        if (PACED.has(job.kind)) this.lastPaced = Date.now();
      }
    } finally {
      this.working = false;
    }
  }

  async run(job) {
    if (job.kind === "download") return flow.downloadAsset(job.params.name, job.params.stem, job.params.quality);
    if (job.kind === "generate") await this.resolveChain(job);
    return RUNNERS[job.kind](job);
  }

  // An exact join: the previous clip's real last frame becomes this clip's opening frame.
  async resolveChain(job) {
    const p = job.params;
    let source = p.chain_from;
    if (p.chain_job) {
      const previous = this.jobs.get(p.chain_job);
      source = previous?.files.find((f) => /\.mp4$/i.test(f));
      if (!source) throw new Error(`This scene continues from job ${p.chain_job}, which produced no clip (${previous?.error ?? previous?.status ?? "unknown job"}). Nothing was generated.`);
    }
    if (!source) return;
    if (!existsSync(source)) throw new Error(`Clip to continue from was not found: ${source}`);
    job.progress = "grabbing the previous clip's last frame";
    p.first_frame = await lastFrame(source);
  }

  // Quick, read-mostly work in the Flow tab. Refused while a job is driving the page, and holds the queue while it runs.
  async onPage(what, fn) {
    const busy = this.running;
    if (busy) throw new Error(`Flow is busy with job ${busy.id} (${busy.label}). ${what} has to wait until it finishes: call flow_wait first.`);
    this.direct++;
    try {
      return await fn();
    } finally {
      this.direct--;
    }
  }

  // ---- operations

  async status() {
    const jobs = [...this.jobs.values()];
    const busy = this.running;
    const state = busy ? await flow.flowState(false).catch((err) => ({ hint: err.message })) : await this.onPage("status", () => flow.flowState(true)).catch((err) => ({ hint: err.message }));
    if (state.credits_remaining !== undefined) this.lastCredits = state.credits_remaining;
    else if (this.lastCredits !== undefined) state.credits_last_seen = this.lastCredits;
    return {
      ...state,
      queue: { running: busy ? this.view(busy) : null, queued: jobs.filter((j) => j.status === "queued").length, failed: jobs.filter((j) => j.status === "failed").length, pacing: this.pacing },
      output_dir: OUT,
      narration: { google_key_saved: Boolean(googleKey()) },
      playbook: PLAYBOOK,
    };
  }

  async generate({ project, scenes, start_number }) {
    const dir = projectDir(project);
    const counters = { video: start_number ?? nextNumber(dir, "scene"), image: start_number ?? nextNumber(dir, "frame") };
    const queued = [];
    let previous;
    for (const [i, input] of scenes.entries()) {
      const { chain_previous, technique, ...s } = input;
      if (technique) {
        const preset = techniqueById(technique);
        if (!preset) throw new Error(`Scene ${i + 1}: no technique with id "${technique}". Call flow_techniques for the list.`);
        s.prompt = `${s.prompt.trim().replace(/[.\s]*$/, ".")} ${preset.phrase}`;
      }
      if (chain_previous || s.chain_from) {
        if (s.type !== "video") throw new Error(`Scene ${i + 1}: only a video can continue from a previous clip.`);
        if (s.first_frame) throw new Error(`Scene ${i + 1}: set either first_frame or a chain, not both.`);
        if (chain_previous && !s.chain_from) {
          if (!previous || previous.params.type !== "video") throw new Error(`Scene ${i + 1}: chain_previous needs a video scene before it in the same call. To continue an older clip, pass chain_from with its file path.`);
          s.chain_job = previous.id;
        }
      }
      const stem = numbered(s.type === "video" ? "scene" : "frame", counters[s.type]++);
      previous = this.enqueue("generate", { ...s, output_dir: dir, file_stem: stem }, `${project}/${stem}`);
      queued.push(previous);
    }
    return {
      queued: queued.map((j) => ({ job_id: j.id, file: j.label, type: j.params.type, limit: j.params.max_credits })),
      next: "Call flow_wait until finished is true. Scenes run one at a time with a pause between them.",
    };
  }

  async wait({ job_ids, timeout_seconds = 40 }) {
    const targets = () => (job_ids?.length ? job_ids.map((id) => this.jobs.get(id)).filter(Boolean) : [...this.jobs.values()]);
    const unknown = (job_ids ?? []).filter((id) => !this.jobs.has(id));
    const open = () => targets().filter((j) => j.status === "queued" || j.status === "running");
    const deadline = Date.now() + timeout_seconds * 1000;
    while (open().length && Date.now() < deadline) await pause(500);
    const jobs = targets();
    const spent = jobs.reduce((sum, j) => sum + (j.status === "done" ? (j.credits ?? 0) : 0), 0);
    return {
      finished: open().length === 0,
      jobs: jobs.map((j) => this.view(j)),
      credits_quoted_for_finished_jobs: spent,
      pacing: this.pacing,
      ...(unknown.length ? { unknown_job_ids: unknown } : {}),
      ...(open().length ? { next: "Still working. Call flow_wait again; do not repeat the original request." } : {}),
    };
  }

  async cancel({ job_id }) {
    const job = this.jobs.get(job_id);
    if (!job) throw new Error(`No job ${job_id}.`);
    if (job.status !== "queued") throw new Error(`Job ${job_id} is ${job.status}; only a queued job can be cancelled.`);
    job.status = "cancelled";
    return this.view(job);
  }

  async retry({ job_ids }) {
    const again = [...this.jobs.values()].filter((j) => (job_ids?.length ? job_ids.includes(j.id) : true) && (j.status === "failed" || j.status === "cancelled"));
    for (const job of again) job.status = "queued";
    void this.work();
    return { requeued: again.map((j) => this.view(j)), warning: again.length ? "If a failed job timed out, check flow_assets first: Flow may have finished it, and flow_download is free." : undefined };
  }

  assets = () => this.onPage("Listing the library", async () => ({ assets: await flow.listAssets() }));

  characters = () => this.onPage("Listing the cast", async () => ({ characters: await flow.listCharacters() }));

  trash = ({ name }) => this.onPage("Trashing", () => flow.trashAsset(name));

  async download({ name, project, file_name, quality }) {
    const dir = projectDir(project);
    const stem = file_name ? safeName(file_name) : numbered("clip", nextNumber(dir, "clip"));
    const job = this.enqueue("download", { name, stem: join(dir, stem), quality }, `download ${name}`);
    return { job_id: job.id, next: "Call flow_wait for the file path. Downloading costs no credits." };
  }

  async character(c) {
    if (!c.describe && !c.image) throw new Error("Give the character a description (Flow draws the portrait) or an image.");
    const job = this.enqueue("character", c, `character ${c.name}`);
    return { job_id: job.id, reference: `asset:${c.name}`, next: "Call flow_wait; it returns the portrait file. Show it to the user before going on." };
  }

  async character_edit(c) {
    if (c.look && flow.characterLook(c.name)) flow.rememberLook(c.name, `${flow.characterLook(c.name)} Changed since: ${c.look}`);
    const job = this.enqueue("character_edit", c, `edit ${c.name}`);
    return { job_id: job.id, next: "Call flow_wait; it returns the new portrait file." };
  }

  async restyle({ asset, prompt, project, download_quality }) {
    const dir = projectDir(project);
    const stem = numbered("edit", nextNumber(dir, "edit"));
    const job = this.enqueue("restyle", { asset, prompt, output_dir: dir, file_stem: stem, download_quality }, `${project}/${stem}`);
    return { job_id: job.id, next: "Call flow_wait. The credits actually spent are reported when it finishes." };
  }

  async techniques({ category }) {
    return { techniques: TECHNIQUES.filter((t) => !category || t.category === category), use: "Pass an id as a scene's `technique`. One per scene." };
  }

  async voices() {
    return { google: { ready: Boolean(googleKey()), setup: googleKey() ? undefined : "Paste a free Google AI Studio key in the panel's Voice tab (never in chat), or set GEMINI_API_KEY.", voices: GOOGLE_VOICES }, local: await localVoices() };
  }

  async narrate({ text, engine, voice, style, project, file_name }) {
    const dir = projectDir(project);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, safeName(file_name).replace(/\.\w+$/, "") + ".wav");
    if (engine === "google") {
      const name = GOOGLE_VOICES.find((v) => v.name.toLowerCase() === (voice ?? "Charon").toLowerCase())?.name;
      if (!name) throw new Error(`No Google voice called "${voice}". Call flow_voices for the list.`);
      return { ...(await speakWithGoogle(text, name, target, style)), engine, voice: name, credits: 0 };
    }
    const local = await localVoices();
    const name = voice ?? local[0]?.name;
    if (!name) throw new Error(`No local voice is installed. ${LOCAL_VOICE_HINT}, or use engine "google".`);
    return { ...(await speakLocally(text, name, target)), engine, voice: name, credits: 0 };
  }

  async cut({ project, clips, voiceover, music, ...rest }) {
    const dir = projectDir(project);
    const film = await cut({ dir, clips: clips?.map((c) => inProject(dir, c)), voiceover: voiceover && inProject(dir, voiceover), music: music && inProject(dir, music), ...rest });
    const note = film.held_last_frame > 0.5 ? `The narration outlasts the footage, so the last frame is frozen for ${film.held_last_frame} s. Add a shot to avoid the freeze.` : undefined;
    return { ...film, credits: 0, ...(note ? { note } : {}) };
  }

  // ---- panel only

  set_key = ({ key }) => saveGoogleKey(key);

  async outputs() {
    const projects = [];
    if (existsSync(OUT)) {
      for (const name of readdirSync(OUT).sort()) {
        const dir = join(OUT, name);
        if (!statSync(dir).isDirectory()) continue;
        const files = [];
        for (const f of readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
          const kind = KIND[extname(f).toLowerCase()];
          if (!kind || /-lastframe\.jpg$/.test(f)) continue;
          const path = join(dir, f);
          const info = statSync(path);
          files.push({ name: f, path, kind, size: info.size, modified: info.mtimeMs, duration: kind === "image" ? undefined : await this.durationOf(path, info.mtimeMs) });
        }
        projects.push({ project: name, files });
      }
    }
    return { root: OUT, projects, jobs: [...this.jobs.values()].slice(-40).map((j) => this.view(j)) };
  }

  // The panel polls this listing, so each file is probed once per version rather than on every poll.
  durations = new Map();
  async durationOf(path, modified) {
    const key = `${path}:${modified}`;
    if (!this.durations.has(key)) this.durations.set(key, await duration(path).catch(() => undefined));
    return this.durations.get(key);
  }

  async discard({ path }) {
    if (!(insideDir(path, OUT) || insideDir(path, UPLOAD_DIR)) || !existsSync(path)) throw new Error("Only files inside the Flow Studio output folder can be moved to the Trash from here.");
    moveToTrash(resolve(path));
    return { trashed: relative(OUT, path), restore: "It is in this computer's Trash and can be restored from there." };
  }
}
