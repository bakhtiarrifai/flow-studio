// The operations behind both the MCP tools and the control panel, plus the job queue that keeps Flow to one task at a time.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { DEFAULT_MAX_CREDITS, OUT, PAUSE_MAX_S, PAUSE_MIN_S, UPLOAD_DIR, projectDir, safeName } from "./config.js";
import * as flow from "./flow.js";
import { cut, duration, lastFrame, motionJoin, motionPlan } from "./media.js";
import { BOARD_FILE, boardShape, castImage, inFilm, pad, readBoard, sceneState, writeBoard } from "./storyboard.js";
import { MOTION_MODELS, kieBalance, kieKey, motionEstimate, motionTransfer, saveKieKey } from "./kie.js";
import { GOOGLE_VOICES, LOCAL_VOICE_HINT, googleKey, localVoices, saveGoogleKey, speakLocally, speakWithGoogle } from "./narrate.js";
import { TECHNIQUES, techniqueById } from "./techniques.js";

// ---------------------------------------------------------------- argument shapes

// Cheaper video settings. Flow's quotes for an 8 s clip (November 2026): Omni Flash 8 credits at 360p and 24 at 720p,
// Veo 3.1 - Lite 10 at 720p (it offers no other size), Veo 3.1 - Fast 20.
const ECONOMY = {
  draft: { model: "Omni Flash", resolution: "360p" },
  lite: { model: "Veo 3.1 Lite" },
};

const project = z.string().min(1).default("untitled").describe("Folder name for this film's files under the output directory.");
const quality = z.enum(["original", "upscaled"]).default("original").describe("'upscaled' asks Flow for its free upscale (1080p video / 2K stills) where the plan allows it; slower.");

const scene = z.object({
  prompt: z.string().min(1).describe("One continuous shot, in English: subject and action, shot size and camera move, location, style, light, sound."),
  type: z.enum(["video", "image"]).default("video").describe("Stills are free on Flow's default image model; get them right before paying for video."),
  model: z.string().optional().describe("Model name as Flow shows it, e.g. 'Omni Flash', 'Veo 3.1 - Lite', 'Nano Banana'. Every word must appear in Flow's name; the newest match wins. Omit to keep whatever Flow has selected."),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).optional().describe("Video supports 16:9 and 9:16."),
  duration: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]).optional().describe("Clip length in seconds, for models that allow a choice."),
  resolution: z.enum(["360p", "720p"]).optional().describe("Only some models offer a choice (Omni Flash does; Veo 3.1 does not)."),
  economy: z.union([z.boolean(), z.enum(["draft", "lite"])]).default(false).describe("Save credits on a video, unless model or resolution is set. 'draft' (or true): Omni Flash at 360p, 8 credits, softer picture. 'lite': Veo 3.1 - Lite at 720p, 10 credits, half the price of Veo 3.1 - Fast."),
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
  motion_plan: {
    project,
    video: z.string().min(1).describe("The performance to copy: one continuous shot of one person, not too fast. Absolute path, or relative to the project folder."),
    segment_seconds: z.number().min(1).max(10).default(3).describe("Longest source time per generated clip. Shorter follows the motion more closely but costs more clips."),
  },
  motion_join: {
    project,
    clips: z.array(z.string()).min(1).describe("One generated clip per plan segment, in order (absolute, or relative to the project folder)."),
    source_audio: z.boolean().default(false).describe("Lay the reference video's sound over the result."),
    output_name: z.string().default("motion"),
  },
  motion_info: {
    project,
  },
  storyboard: {
    project,
    storyboard: boardShape.optional().describe("Give it to save (replaces the whole storyboard); omit to read. Scene state comes from the files on disk."),
  },
  resume: {
    project,
    scenes: z.array(z.number().int().min(1)).optional().describe("Scene numbers to make. Omit for every scene that has no clip yet."),
    max_credits: z.number().min(0).optional().describe("Spending limit per scene where the storyboard sets none."),
  },
  account: {
    switch: z.boolean().default(false).describe("Open Google's account page in the Flow window so the user can switch or add an account by hand."),
  },
  motion_transfer: {
    project,
    character_image: z.string().min(1).describe("Who should perform: a JPG or PNG showing head, shoulders and torso. Absolute path, or relative to the project folder."),
    video: z.string().min(1).describe("The performance to copy: MP4 or MOV, 3 to 10 s (30 s with orientation 'video'), head, shoulders and torso visible."),
    model: z.enum(Object.keys(MOTION_MODELS)).default("kling-2.6").describe("kling-2.6 is cheaper (12.6 kie credits per second at 720p); kling-3.0 is newer (22.7)."),
    resolution: z.enum(["720p", "1080p"]).default("720p"),
    orientation: z.enum(["image", "video"]).default("video").describe("Whose framing and facing the result follows: the video's (up to 30 s) or the image's (up to 10 s)."),
    prompt: z.string().max(2500).optional().describe("Optional: setting, style or details to add."),
    max_usd: z.number().min(0).default(1).describe("Spending limit. The estimate is checked against it before anything is uploaded."),
    quote_only: z.boolean().default(false).describe("Only return the estimate and the kie.ai balance. Free."),
    confirmed: z.boolean().default(false).describe("Set only after the user has agreed to the estimate. Charged to the user's kie.ai balance, not Flow credits."),
  },
  // Panel only: these are deliberately not MCP tools.
  set_key: { key: z.string().min(1) },
  set_kie_key: { key: z.string().min(1) },
  kie_balance: {},
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
    "economy 'draft' makes a video on Omni Flash at 360p for 8 credits: offer it for drafts and tests. economy 'lite' uses Veo 3.1 - Lite at 720p for 10 credits, half of Veo 3.1 - Fast: offer it for finished clips on a budget.",
    "Every scene has max_credits. Flow's own quote is read before generating and the scene is skipped if it is over.",
    "A clip that was generated but did not download is still in Flow: fetch it with flow_download. Never generate it again.",
    "flow_restyle has no quote beforehand and has cost more than a new clip. Always get the user's agreement first.",
  ],
  accounts: [
    "Keep every film's plan in flow_storyboard: script, cast, and per scene the prompt, frame (or frame_prompt), voice and settings. Save it before generating.",
    "A Flow project belongs to one Google account and cannot be shared, so nothing in Flow carries over to another account. The storyboard and the files on this computer do.",
    "When credits run out: flow_account with switch, the user picks or signs in to another account in the Flow window, then flow_resume. It opens or creates the film's project on that account, uploads frames and cast portraits from this computer, draws missing stills for free, and makes only scenes that have no clip yet.",
  ],
  motion: [
    "flow_motion_plan splits a reference video into segments, free. Show the user any cuts it reports: motion does not carry across a cut.",
    "Stills, free: for every pose, one image scene with reference_images [the character, that pose file], asking for this character in exactly the pose of the second image, in the wanted setting. Check them before any video.",
    "Clips, paid: one scene per segment with first_frame and last_frame set to the two stills, the segment's clip_duration, and a prompt describing the movement you see between the poses. State the credit total first.",
    "flow_motion_join retimes the clips to the source's timing and joins them, free.",
    "Motion between two poses is the model's own interpolation, not a copy of the source: shorter segments follow it more closely.",
    "For a true copy of the movement, flow_motion_transfer sends one character image and one reference video to Kling Motion Control on kie.ai. It is paid from the user's kie.ai balance in dollars: get its quote with quote_only, tell the user, and pass confirmed only after they agree.",
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
    const p = job.params;
    // A job that depends on another (opening the film's project, drawing its still) never runs after that one failed.
    if (p.after) {
      const dep = this.jobs.get(p.after);
      if (dep?.status !== "done") throw new Error(`Skipped because ${dep?.label ?? "an earlier step"} did not succeed (${dep?.error ?? dep?.status ?? "unknown"}). Nothing was generated.`);
    }
    if (job.kind === "open_project") return this.openFilmProject(job);
    if (p.frame_job) {
      const still = this.jobs.get(p.frame_job)?.files.find((f) => /\.(jpe?g|png|webp)$/i.test(f));
      if (!still) throw new Error("Its opening still was not drawn. Nothing was generated.");
      p.first_frame = still;
    }
    if (job.kind === "download") return flow.downloadAsset(job.params.name, job.params.stem, job.params.quality);
    if (job.kind === "generate") await this.resolveChain(job);
    return RUNNERS[job.kind](job);
  }

  async openFilmProject(job) {
    const { title, dir } = job.params;
    const board = readBoard(dir) ?? {};
    const r = await flow.openProject({ title, projects: board.flow_projects });
    if (r.account) {
      const fresh = readBoard(dir) ?? board;
      writeBoard(dir, { ...fresh, flow_projects: { ...fresh.flow_projects, [r.account]: r.project } });
    }
    job.note = `${r.created ? "created" : "opened"} Flow project "${title}"${r.account ? ` on ${r.account}` : ""}`;
    return [];
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
      motion_transfer: { kie_key_saved: Boolean(kieKey()) },
      playbook: PLAYBOOK,
    };
  }

  async generate({ project, scenes, start_number }) {
    const dir = projectDir(project);
    const counters = { video: start_number ?? nextNumber(dir, "scene"), image: start_number ?? nextNumber(dir, "frame") };
    const queued = [];
    let previous;
    for (const [i, input] of scenes.entries()) {
      const { chain_previous, technique, economy, ...s } = input;
      const saving = ECONOMY[economy === true ? "draft" : economy];
      if (saving && s.type === "video" && !s.model && !s.resolution) Object.assign(s, saving);
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

  // ---- storyboard and accounts

  boardView(dir, board) {
    const scenes = (board.scenes ?? []).map((s) => {
      const state = sceneState(dir, s);
      return { ...s, done: state.done, clip: state.clip, frame_file: state.frame };
    });
    const done = scenes.filter((s) => s.done).length;
    return { path: join(dir, BOARD_FILE), ...board, scenes, progress: `${done} of ${scenes.length} scenes have a clip` };
  }

  async storyboard({ project, storyboard }) {
    const dir = projectDir(project);
    const old = readBoard(dir);
    if (storyboard) {
      const numbers = storyboard.scenes.map((s) => s.number);
      const twice = numbers.find((n, i) => numbers.indexOf(n) !== i);
      if (twice) throw new Error(`Scene number ${twice} is used twice. Each scene needs its own number.`);
      mkdirSync(dir, { recursive: true });
      // Which Flow project holds this film on each account is Flow Studio's own record, kept across saves.
      const board = { ...storyboard, scenes: [...storyboard.scenes].sort((a, b) => a.number - b.number), ...(old?.flow_projects ? { flow_projects: old.flow_projects } : {}) };
      writeBoard(dir, board);
      return { saved: true, ...this.boardView(dir, board) };
    }
    if (!old) return { exists: false, path: join(dir, BOARD_FILE), next: "Save one with flow_storyboard and a storyboard object." };
    return this.boardView(dir, old);
  }

  // Carries a film on with whichever account is signed in: its own Flow project there, inputs uploaded from this
  // computer, missing stills drawn first (free), and only the scenes that have no clip yet.
  async resume({ project, scenes: only, max_credits }) {
    const dir = projectDir(project);
    const board = readBoard(dir);
    if (!board) throw new Error(`No storyboard for "${project}". Save one with flow_storyboard first.`);
    const style = (text) => (board.style && !text.includes(board.style) ? `${text.trim().replace(/[.\s]*$/, ".")} ${board.style}` : text);
    const asRef = (r) => (/[/\\]|\.(jpe?g|png|webp)$/i.test(r) ? inFilm(dir, r) : (castImage(board, r) ?? `asset:${r.replace(/^asset:/, "")}`));
    const todo = (board.scenes ?? []).filter((s) => (!only || only.includes(s.number)) && !sceneState(dir, s).done).sort((a, b) => a.number - b.number);
    if (!todo.length) return { queued: [], note: "Every scene asked for already has a clip. Nothing was queued." };

    const title = safeName(project);
    const open = this.enqueue("open_project", { title, dir }, `${project}: open its Flow project`);
    const queued = [{ job_id: open.id, file: "(Flow project)", type: "project" }];
    for (const s of todo) {
      const refs = (s.references ?? []).map(asRef);
      const first = sceneState(dir, s).frame;
      let frameJob;
      if (!first && s.frame_prompt) {
        const stem = `frame-${pad(s.number)}`;
        frameJob = this.enqueue("generate", { prompt: style(s.frame_prompt), type: "image", aspect_ratio: board.aspect_ratio, reference_images: refs.length ? refs : undefined, variants: 1, max_credits: 0, download_quality: "original", output_dir: dir, file_stem: stem, after: open.id }, `${project}/${stem}`);
        queued.push({ job_id: frameJob.id, file: stem, type: "image", limit: 0 });
      }
      const stem = `scene-${pad(s.number)}`;
      const params = {
        prompt: style(s.prompt), type: "video", aspect_ratio: board.aspect_ratio, variants: 1, download_quality: "original",
        first_frame: first, frame_job: frameJob?.id, last_frame: s.last_frame && inFilm(dir, s.last_frame),
        reference_images: !first && !frameJob && refs.length ? refs : undefined,
        model: s.model, resolution: s.resolution, duration: s.duration,
        max_credits: s.max_credits ?? max_credits ?? DEFAULT_MAX_CREDITS,
        output_dir: dir, file_stem: stem, after: frameJob?.id ?? open.id,
      };
      const saving = ECONOMY[s.economy === true ? "draft" : s.economy];
      if (saving && !params.model && !params.resolution) Object.assign(params, saving);
      const job = this.enqueue("generate", params, `${project}/${stem}`);
      queued.push({ job_id: job.id, file: stem, type: "video", limit: params.max_credits });
    }
    return { queued, scenes: todo.map((s) => s.number), next: "Opens the film's Flow project on the signed-in account, then makes the scenes in order. Follow with flow_wait." };
  }

  async account({ switch: change }) {
    if (change) {
      const pending = [...this.jobs.values()].filter((j) => j.status === "queued" || j.status === "running");
      if (pending.length) throw new Error(`${pending.length} job(s) are still queued or running on this account. Wait for them, or cancel the queued ones, before switching.`);
      await this.onPage("switching account", () => flow.switchAccount());
      return { opened: true, next: "In the Flow window, choose or add the other Google account. Then call flow_account to confirm it, and flow_resume to carry on." };
    }
    const s = await this.onPage("account", () => flow.flowState(true));
    return { account: s.account, signed_in: s.signedIn, plan: s.plan, credits_remaining: s.credits_remaining, ...(s.hint ? { hint: s.hint } : {}) };
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

  async motion_plan({ project, video, segment_seconds }) {
    const dir = projectDir(project);
    return { ...(await motionPlan({ video: inProject(dir, video), dir, segment_seconds })), credits: 0, next: "Follow the motion section of the playbook in flow_status." };
  }

  async motion_join({ project, clips, source_audio, output_name }) {
    const dir = projectDir(project);
    return { ...(await motionJoin({ dir, plan: join(dir, "motion", "plan.json"), clips: clips.map((c) => inProject(dir, c)), source_audio, output_name })), credits: 0 };
  }

  async motion_info({ project }) {
    const dir = projectDir(project);
    const planPath = join(dir, "motion", "plan.json");
    if (!existsSync(planPath)) return { has_plan: false };
    try {
      const plan = JSON.parse(readFileSync(planPath, "utf8"));
      return { has_plan: true, plan, dir };
    } catch {
      return { has_plan: false };
    }
  }

  // ---- panel only

  set_key = ({ key }) => saveGoogleKey(key);
  set_kie_key = ({ key }) => saveKieKey(key);
  kie_balance = () => kieBalance();

  // Runs beside Flow's queue rather than in it: kie.ai is a separate service and a task takes minutes.
  async motion_transfer({ project, character_image, video, model, resolution, orientation, prompt, max_usd, quote_only, confirmed }) {
    const dir = projectDir(project);
    const image = inProject(dir, character_image);
    const source = inProject(dir, video);
    for (const f of [image, source]) if (!existsSync(f)) throw new Error(`File not found: ${f}`);
    const seconds = await duration(source);
    const estimate = motionEstimate({ model, resolution, orientation, seconds });
    const quote = { model, resolution, seconds: Number(seconds.toFixed(2)), estimate_usd: estimate.usd, estimate_kie_credits: estimate.kie_credits };
    if (quote_only) return { ...quote, balance: kieKey() ? await kieBalance() : "no kie.ai key saved", credits: 0 };
    if (estimate.usd > max_usd) throw new Error(`Estimated $${estimate.usd} is over the limit of $${max_usd}. Nothing was sent. Raise max_usd, or use a shorter video, 720p or kling-2.6.`);
    if (!confirmed) throw new Error(`This costs about $${estimate.usd} from the kie.ai balance. Ask the user, then call again with confirmed: true.`);
    if (!kieKey()) throw new Error("No kie.ai API key saved. Paste it into the panel's Motion tab.");
    mkdirSync(dir, { recursive: true });
    const stem = numbered("transfer", nextNumber(dir, "transfer"));
    const job = { id: randomUUID().slice(0, 8), kind: "motion_transfer", label: `${project}/${stem}`, status: "running", params: { model, resolution }, files: [], attempts: 1, created: new Date().toISOString(), note: `estimate $${estimate.usd} on kie.ai` };
    this.jobs.set(job.id, job);
    // Reserves the file name so a second transfer started meanwhile gets the next number.
    writeFileSync(join(dir, `${stem}.mp4.part`), "");
    motionTransfer({ image, video: source, model, resolution, orientation, prompt, target: join(dir, `${stem}.mp4`) }, (p) => (job.progress = p))
      .then((r) => {
        job.files = [r.file];
        job.note = `kie.ai task ${r.task_id}, charged ${r.kie_credits_charged ?? "?"} kie credits (estimate ${estimate.kie_credits})`;
        job.status = "done";
      })
      .catch((err) => {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        job.progress = undefined;
        job.finished = new Date().toISOString();
        rmSync(join(dir, `${stem}.mp4.part`), { force: true });
      });
    return { job_id: job.id, file: `${stem}.mp4`, ...quote, next: "Takes a few minutes. Call flow_wait with this job id until finished is true." };
  }

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
