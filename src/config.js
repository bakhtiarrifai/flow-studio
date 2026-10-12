import { homedir } from "node:os";
import { join, resolve } from "node:path";

const env = process.env;

// Private state: browser profile, API key, token, uploads, raw downloads.
export const HOME = env.FLOW_STUDIO_HOME ?? join(homedir(), ".flow-studio");
// Finished stills, clips, narrations and films.
export const OUT = env.FLOW_STUDIO_OUTPUT ?? join(homedir(), "flow-studio-out");

export const PROFILE_DIR = join(HOME, "browser-profile");
export const DOWNLOAD_DIR = join(HOME, "downloads");
export const UPLOAD_DIR = join(HOME, "uploads");
export const TOKEN_FILE = join(HOME, "token");
export const KEY_FILE = join(HOME, "gemini-key");
export const CAST_FILE = join(HOME, "cast.json");

export const PORT = Number(env.FLOW_STUDIO_PORT ?? 8791);
export const CDP_PORT = Number(env.FLOW_STUDIO_CDP_PORT ?? 9344);
export const FLOW_URL = "https://flow.google.com/";

export const FFMPEG = env.FLOW_STUDIO_FFMPEG ?? "ffmpeg";
export const FFPROBE = env.FLOW_STUDIO_FFPROBE ?? "ffprobe";

// Pause between generations, in seconds. Flow is driven at a person's pace, one generation at a time.
export const PAUSE_MIN_S = Number(env.FLOW_STUDIO_PAUSE_MIN_S ?? 25);
export const PAUSE_MAX_S = Number(env.FLOW_STUDIO_PAUSE_MAX_S ?? 70);

export const DEFAULT_MAX_CREDITS = 25;

export const safeName = (s) => String(s).trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "untitled";
export const projectDir = (project) => resolve(OUT, safeName(project));
