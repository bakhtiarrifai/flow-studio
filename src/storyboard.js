// A film's storyboard, kept on this computer next to its files: script, cast and every scene's prompt, frames, voice
// and settings. Flow projects belong to one Google account, so the storyboard and the local files are what let a
// production carry on from any account.
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { OUT, safeName } from "./config.js";

export const BOARD_FILE = "storyboard.json";
const CAST_DIR = join(OUT, "_cast");

const boardScene = z.object({
  number: z.number().int().min(1).max(999).describe("Scene number; its clip is saved as scene-NN.mp4 and its still as frame-NN."),
  prompt: z.string().min(1).describe("The video prompt for this shot, in English."),
  frame: z.string().optional().describe("Opening still, relative to the film folder (e.g. frame-01.jpg) or absolute."),
  frame_prompt: z.string().optional().describe("How to draw the opening still if its file is missing. Stills are free."),
  last_frame: z.string().optional().describe("Closing still, if the shot must land on one."),
  references: z.array(z.string()).max(3).optional().describe("Cast names or image files to keep on-model when there is no frame."),
  line: z.string().optional().describe("Spoken words in this scene, for the record."),
  voice: z.string().optional().describe("Narration or dialogue file for this scene, relative to the film folder."),
  notes: z.string().optional(),
  model: z.string().optional(),
  economy: z.union([z.boolean(), z.enum(["draft", "lite"])]).optional(),
  resolution: z.enum(["360p", "720p"]).optional(),
  duration: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]).optional(),
  max_credits: z.number().min(0).optional(),
});

export const boardShape = z.object({
  title: z.string().optional(),
  script: z.string().optional().describe("The full script, as written."),
  style: z.string().optional().describe("Look shared by every scene; added to each prompt that does not already contain it."),
  aspect_ratio: z.enum(["16:9", "9:16"]).default("16:9"),
  cast: z.array(z.object({ name: z.string().min(1), image: z.string().optional(), look: z.string().optional() })).default([]),
  scenes: z.array(boardScene).default([]),
});

export const pad = (n) => String(n).padStart(2, "0");
export const inFilm = (dir, file) => (isAbsolute(file) ? file : join(dir, file));

export function readBoard(dir) {
  const path = join(dir, BOARD_FILE);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${path} is not valid JSON (${err.message}). Fix or remove it.`);
  }
}

// Written to a temporary file first, so a crash never leaves half a storyboard.
export function writeBoard(dir, board) {
  const path = join(dir, BOARD_FILE);
  writeFileSync(`${path}.tmp`, JSON.stringify(board, null, 2));
  renameSync(`${path}.tmp`, path);
  return path;
}

function firstMatch(dir, stem) {
  if (!existsSync(dir)) return undefined;
  const hit = readdirSync(dir).find((f) => f.startsWith(`${stem}.`) && !f.endsWith(".part") && !f.endsWith(".tmp"));
  return hit && join(dir, hit);
}

// A cast member's portrait on this computer: the storyboard's own entry, else the one Flow Studio saved when the
// character was created.
export function castImage(board, name) {
  const bare = name.replace(/^asset:/, "").trim();
  const entry = board.cast?.find((c) => c.name.toLowerCase() === bare.toLowerCase());
  if (entry?.image) return entry.image;
  return firstMatch(CAST_DIR, safeName(bare));
}

// What exists on disk decides a scene's state, so the storyboard never claims a clip that is not there.
export function sceneState(dir, scene) {
  const clip = firstMatch(dir, `scene-${pad(scene.number)}`);
  const frame = scene.frame ? (existsSync(inFilm(dir, scene.frame)) ? inFilm(dir, scene.frame) : undefined) : firstMatch(dir, `frame-${pad(scene.number)}`);
  return { clip, frame, done: Boolean(clip) };
}
