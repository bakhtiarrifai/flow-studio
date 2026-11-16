// A film's storyboard, kept on this computer next to its files: script, cast and every scene's prompt, frames, voice
// and settings. Flow projects belong to one Google account, so the storyboard and the local files are what let a
// production carry on from any account.
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { OUT, safeName } from "./config.js";
import { STYLE_PRESETS, STYLE_PRESET_NAMES } from "./styles.js";

export const BOARD_FILE = "storyboard.json";
const CAST_DIR = join(OUT, "_cast");

const boardScene = z
  .object({
    number: z.number().int().min(1).max(999).describe("Scene number; its clip is saved as scene-NN.mp4 and its still as frame-NN."),
    title: z.string().optional().describe("Short shot title, for the record."),
    prompt: z.string().optional().describe("The video prompt for this shot, in English. Wins over visual/motion/audio when both are given."),
    visual: z.string().optional().describe("What the shot looks like: subject, setting, light. With motion and audio it becomes the prompt when `prompt` is left out."),
    motion: z.string().optional().describe("What moves: action and camera."),
    audio: z.string().optional().describe("Sound in the shot: ambience, effects, spoken lines."),
    assets: z.array(z.string()).max(6).optional().describe("Cast, locations and props that appear in this shot, by name. The first three are sent to Flow as references (when there is no frame), and cast looks are added to the prompt."),
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
  })
  .refine((s) => Boolean(s.prompt?.trim() || s.visual?.trim()), { message: "Each scene needs a prompt, or a visual description to build one from." });

const image = z.string().optional().describe("Reference image file, relative to the film folder or absolute.");

export const boardShape = z.object({
  title: z.string().optional(),
  script: z.string().optional().describe("The full script, as written."),
  style: z.string().optional().describe("Look shared by every scene; added to each prompt that does not already contain it."),
  style_preset: z.enum(STYLE_PRESET_NAMES).optional().describe("A ready-made look (added before `style`)."),
  aspect_ratio: z.enum(["16:9", "9:16"]).default("16:9"),
  cast: z
    .array(
      z.object({
        name: z.string().min(1),
        image,
        look: z.string().optional().describe("One-line look, restated in prompts that link this character."),
        physical: z.string().optional().describe("Face, build, age."),
        clothing: z.string().optional().describe("Clothing and accessories."),
        backstory: z.string().optional(),
        voice: z.string().optional(),
      }),
    )
    .default([]),
  locations: z.array(z.object({ name: z.string().min(1), image, description: z.string().optional(), time_of_day: z.string().optional() })).default([]),
  props: z.array(z.object({ name: z.string().min(1), image, description: z.string().optional() })).default([]),
  scenes: z.array(boardScene).default([]),
});

// The video prompt: the written one, else visual + motion + audio joined into sentences.
export function scenePrompt(scene) {
  if (scene.prompt?.trim()) return scene.prompt.trim();
  const end = (t) => t.trim().replace(/[.\s]*$/, ".");
  return [scene.visual, scene.motion, scene.audio && `Sound: ${scene.audio}`].filter((t) => t?.trim()).map(end).join(" ");
}

// The look every prompt carries: the preset's text, then the storyboard's own style.
export const boardStyle = (board) => [STYLE_PRESETS[board.style_preset], board.style?.trim()].filter(Boolean).join(" ") || undefined;

// A linked asset's name resolves against cast, locations and props alike.
export function findAsset(board, name) {
  const bare = name.replace(/^asset:/, "").trim().toLowerCase();
  for (const kind of ["cast", "locations", "props"]) {
    const hit = board[kind]?.find((a) => a.name.toLowerCase() === bare);
    if (hit) return { kind, ...hit };
  }
  return undefined;
}

// What a linked character looks like, restated in the prompt because Flow remembers nothing between scenes.
export function assetNote(board, name) {
  const a = findAsset(board, name);
  if (!a || a.kind === "props") return undefined;
  const detail = a.kind === "cast" ? [a.look, a.physical, a.clothing] : [a.description, a.time_of_day];
  const text = detail.filter((t) => t?.trim()).map((t) => t.trim().replace(/[.\s]*$/, "")).join(", ");
  return text ? `${a.name}: ${text}` : undefined;
}

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
  const entry = findAsset(board, bare);
  if (entry?.image) return entry.image;
  return firstMatch(CAST_DIR, safeName(bare));
}

// What exists on disk decides a scene's state, so the storyboard never claims a clip that is not there.
export function sceneState(dir, scene) {
  const clip = firstMatch(dir, `scene-${pad(scene.number)}`);
  const frame = scene.frame ? (existsSync(inFilm(dir, scene.frame)) ? inFilm(dir, scene.frame) : undefined) : firstMatch(dir, `frame-${pad(scene.number)}`);
  return { clip, frame, done: Boolean(clip) };
}
