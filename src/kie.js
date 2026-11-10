// True motion transfer through kie.ai: Kling Motion Control copies the movement of a reference video onto a character
// image. Paid in kie.ai credits (1 USD = 200), billed per second of output, which is the length of the reference video.
import { chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HOME, KIE_KEY_FILE } from "./config.js";

const API = "https://api.kie.ai";
const UPLOAD = "https://kieai.redpandaai.co";
export const KIE_CREDITS_PER_USD = 200;

// kie.ai credits per second of output, from its model pages (November 2026). It offers no quote endpoint, so the
// estimate comes from here and the charge it reports afterwards is returned next to it.
export const MOTION_MODELS = {
  "kling-2.6": { model: "kling-2.6/motion-control", rate: { "720p": 12.6, "1080p": 20.2 } },
  "kling-3.0": { model: "kling-3.0/motion-control", rate: { "720p": 22.7, "1080p": 30.2 } },
};
// Kling follows the image's framing for at most 10 s of reference video, or the video's for up to 30 s.
const MAX_SECONDS = { image: 10, video: 30 };
const MIN_SECONDS = 3;

export function kieKey() {
  const key = (process.env.KIE_API_KEY ?? (existsSync(KIE_KEY_FILE) ? readFileSync(KIE_KEY_FILE, "utf8") : "")).trim();
  return key || undefined;
}

// kie.ai answers HTTP 200 even on errors; the outcome is in the body's `code`.
async function call(path, { key = kieKey(), method = "GET", body, base = API } = {}) {
  if (!key) throw new Error("No kie.ai API key saved. Paste it into the panel's Motion tab (it is checked, then stored only on this computer).");
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
    body: body instanceof FormData ? body : body && JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  }).catch((err) => {
    throw new Error(`Could not reach kie.ai (${err.message}).`);
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 200) {
    const why = { 401: "the API key was refused", 402: "the kie.ai balance is too low", 429: "too many requests; wait a little" }[data.code];
    throw new Error(`kie.ai: ${why ?? data.msg ?? `HTTP ${res.status}`}${why && data.msg ? ` (${data.msg})` : ""}.`);
  }
  return data.data;
}

export async function kieBalance(key) {
  const credits = Number(await call("/api/v1/chat/credit", { key }));
  return { credits, usd: Number((credits / KIE_CREDITS_PER_USD).toFixed(2)) };
}

// Checked with kie.ai before it is written, so a typo cannot replace a key that works.
export async function saveKieKey(raw) {
  const key = String(raw).trim();
  if (key.length < 16 || /\s/.test(key)) throw new Error("That does not look like a kie.ai API key. Copy it again from kie.ai/api-key.");
  const balance = await kieBalance(key);
  mkdirSync(HOME, { recursive: true });
  writeFileSync(KIE_KEY_FILE, key, { mode: 0o600 });
  chmodSync(KIE_KEY_FILE, 0o600);
  return { saved: true, ending: key.slice(-4), balance };
}

export function motionEstimate({ model, resolution, orientation, seconds }) {
  const spec = MOTION_MODELS[model];
  if (seconds < MIN_SECONDS) throw new Error(`The reference video is ${seconds.toFixed(1)} s; Kling needs at least ${MIN_SECONDS} s.`);
  if (seconds > MAX_SECONDS[orientation]) {
    throw new Error(`The reference video is ${seconds.toFixed(1)} s, over the ${MAX_SECONDS[orientation]} s Kling allows with character_orientation "${orientation}". Trim it${orientation === "image" ? ', or use "video" (up to 30 s)' : ""}.`);
  }
  const credits = Number((spec.rate[resolution] * seconds).toFixed(1));
  return { kie_credits: credits, usd: Number((credits / KIE_CREDITS_PER_USD).toFixed(3)) };
}

// Files reach kie.ai as temporary links; kie.ai deletes uploads after 24 hours.
async function upload(file) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)]), basename(file));
  form.append("uploadPath", "flow-studio");
  form.append("fileName", `${Date.now()}-${basename(file).replace(/[^\w.-]+/g, "_")}`);
  const data = await call("/api/file-stream-upload", { method: "POST", body: form, base: UPLOAD });
  if (!data?.downloadUrl) throw new Error(`kie.ai accepted the upload of ${basename(file)} but returned no link.`);
  return data.downloadUrl;
}

const IMAGE_TYPES = new Set([".jpg", ".jpeg", ".png"]);
const VIDEO_TYPES = new Set([".mp4", ".mov"]);

// Uploads both files, starts the task, waits for it and saves the clip to `target`. Reports progress through `report`.
export async function motionTransfer({ image, video, model, resolution, orientation, prompt, target }, report = () => {}) {
  if (!IMAGE_TYPES.has(extname(image).toLowerCase())) throw new Error("The character image must be JPG or PNG.");
  if (!VIDEO_TYPES.has(extname(video).toLowerCase())) throw new Error("The reference video must be MP4 or MOV.");
  if (statSync(image).size > 10 * 1024 * 1024) throw new Error("The character image is over kie.ai's 10 MB limit.");
  if (statSync(video).size > 100 * 1024 * 1024) throw new Error("The reference video is over kie.ai's 100 MB limit.");

  report("uploading the character image");
  const imageUrl = await upload(image);
  report("uploading the reference video");
  const videoUrl = await upload(video);
  report("starting the task on kie.ai");
  const input = { input_urls: [imageUrl], video_urls: [videoUrl], character_orientation: orientation, mode: resolution, ...(prompt ? { prompt } : {}) };
  const { taskId } = await call("/api/v1/jobs/createTask", { method: "POST", body: { model: MOTION_MODELS[model].model, input } });

  const deadline = Date.now() + 30 * 60_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 8000));
    const task = await call(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    if (task.state === "fail") throw new Error(`kie.ai could not make the clip: ${task.failMsg || task.failCode || "no reason given"}. Failed tasks are not charged. Task ${taskId}.`);
    if (task.state === "success") {
      const result = typeof task.resultJson === "string" ? JSON.parse(task.resultJson || "{}") : (task.resultJson ?? task.response ?? {});
      const url = result.resultUrls?.[0];
      if (!url) throw new Error(`kie.ai finished task ${taskId} but returned no video link.`);
      report("downloading the clip");
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`The finished clip could not be downloaded (HTTP ${res.status}). Task ${taskId}; its link stays valid for a while.`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(target));
      return { file: target, task_id: taskId, kie_credits_charged: task.creditsConsumed };
    }
    if (Date.now() > deadline) throw new Error(`kie.ai task ${taskId} is still ${task.state} after 30 minutes. It may still finish; check it on kie.ai.`);
    report(`kie.ai: ${task.state}${task.progress !== undefined ? ` ${task.progress}%` : ""}`);
  }
}
