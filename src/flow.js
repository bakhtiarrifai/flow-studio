// The Flow driver: everything that clicks inside the Flow tab lives here.
//
// Flow has no public interface for this, so the driver finds controls by their accessible names and custom element
// tags. When Google changes the page, this is the file that needs updating: the names are collected in UI below.
import { execFileSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { getFlowPage } from "./browser.js";
import { CAST_FILE, DOWNLOAD_DIR, HOME, OUT, safeName } from "./config.js";

const UI = {
  tile: "flow-grid-tile-container",
  errorTile: "flow-error-tile",
  videoTile: "flow-video-tile",
  imageTile: "flow-image-tile",
  sceneTile: "flow-scene-tile",
  characterTile: "flow-character-tile",
  scroller: ".page-container",
  promptBox: ".ProseMirror",
  account: "Account details",
  closeAccount: "Close account panel",
  credits: /Google Flow credits/,
  settings: "Settings trigger",
  modelPicker: "Select model family",
  quote: /credits?$/,
  agentToggle: "Agent",
  clearPrompt: "Clear prompt",
  start: "Start generation",
  addMedia: "Add media menu",
  upload: "Upload",
  assetList: "Asset list",
  addToPrompt: "Add to prompt",
  ingredients: "Add ingredients to the prompt box",
  ingredientChip: "Ingredient",
  startFrame: "Start",
  endFrame: "End",
  more: "More options",
  nav: "Project navigation",
  back: "Back button to go to previous page",
  portrait: "Generated character image",
};

const IMAGE_TIMEOUT = 3 * 60_000;
const VIDEO_TIMEOUT = 12 * 60_000;
const EDIT_TIMEOUT = 10 * 60_000;
const ASSET = "asset:";
// Files this tool uploads into Flow carry this prefix, so they are never mistaken for a finished generation.
const OWN_UPLOAD = "fs-";

const sleep = (page, ms) => page.waitForTimeout(ms);
const visible = (locator, timeout = 0) => (timeout ? locator.waitFor({ state: "visible", timeout }).then(() => true, () => false) : locator.isVisible().catch(() => false));
const oneLine = (text) => text.replace(/\s*\n+\s*/g, " ").trim();
const quoted = (text) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const addNote = (job, note) => {
  if (job) job.note = [job.note, note].filter(Boolean).join(" · ");
};

// ---------------------------------------------------------------- session

export async function flowState(detailed = false) {
  const page = await getFlowPage();
  const url = page.url();
  // Signed-out visitors land on the marketing page or Google's sign-in; both show a link to Google's sign-in.
  const signInLink = await page.locator('a[href*="accounts.google.com/ServiceLogin"]').count().catch(() => 0);
  const signedIn = !/\/about|accounts\.google\.com/.test(url) && !signInLink;
  const inProject = /\/project\//.test(url);
  const state = { url, signedIn, inProject };
  if (!signedIn) state.hint = "Not signed in. Run `npm run login` in the flow-studio folder and sign in to Google in the window that opens.";
  else if (!inProject) state.hint = "Signed in, but no Flow project is open. Open or create a project in the Flow browser window.";
  else if (detailed) {
    state.plan = await page.getByRole("button", { name: UI.account }).innerText().then((t) => t.trim().split("\n")[0], () => undefined);
    state.credits_remaining = await readCredits(page).catch(() => undefined);
    state.composer = await page.getByRole("button", { name: UI.settings }).innerText().then(oneLine, () => undefined);
  }
  return state;
}

async function requireProject() {
  const state = await flowState();
  if (!state.signedIn || !state.inProject) throw new Error(state.hint);
  return getFlowPage();
}

async function dismissOverlays(page) {
  await page.keyboard.press("Escape");
  const close = page.getByRole("button", { name: UI.closeAccount });
  if (await visible(close)) await close.click({ timeout: 5000 }).catch(() => {});
}

// The grid is virtualised and new tiles arrive at the top, so most steps begin by going back there.
async function scrollToTop(page) {
  await page.evaluate((sel) => document.querySelectorAll(sel).forEach((e) => (e.scrollTop = 0)), UI.scroller);
  await sleep(page, 400);
}

async function scrollDown(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const before = el.scrollTop;
    el.scrollTop = before + el.clientHeight * 0.8;
    return el.scrollTop > before;
  }, UI.scroller);
}

// The balance is only shown inside the account panel. Sign out lives there too, so nothing else in it is touched.
async function readCredits(page) {
  await dismissOverlays(page);
  await scrollToTop(page);
  await page.getByRole("button", { name: UI.account }).click({ timeout: 5000 });
  const link = page.getByRole("link", { name: UI.credits });
  try {
    await link.waitFor({ state: "visible", timeout: 5000 });
    const n = Number((await link.innerText()).replace(/[^\d]/g, ""));
    return Number.isNaN(n) ? undefined : n;
  } finally {
    await dismissOverlays(page);
    await sleep(page, 300);
  }
}

async function openGrid(page) {
  await dismissOverlays(page);
  const root = page.url().match(/^https:\/\/[^/]+(?:\/[^/]+)*?\/project\/[0-9a-f-]{36}/)?.[0];
  if (root && page.url() !== root) {
    await page.goto(root, { waitUntil: "domcontentloaded" });
    await sleep(page, 2500);
  }
  await page.getByRole("navigation", { name: UI.nav }).getByText("All media", { exact: true }).click().catch(() => {});
  await sleep(page, 800);
  await scrollToTop(page);
}

async function emptyComposer(page) {
  const agent = page.getByRole("button", { name: UI.agentToggle, exact: true });
  if ((await agent.getAttribute("aria-pressed").catch(() => null)) === "true") await agent.click().catch(() => {});
  const clear = page.getByRole("button", { name: UI.clearPrompt });
  if (await visible(clear)) await clear.click().catch(() => {});
}

// ---------------------------------------------------------------- the grid

// One record per tile currently mounted. A tile's handle is its media id; tiles without one (videos at rest) fall
// back to their title, which is stable, unlike their signed thumbnail URL.
async function readTiles(page) {
  return page.evaluate((ui) => {
    return [...document.querySelectorAll(ui.tile)].map((tile) => {
      const media = tile.querySelector("img[data-media-id], video[data-media-id], img[src], video[src]");
      const label = tile.getAttribute("aria-label") ?? "";
      const id = (media && (media.getAttribute("data-media-id") || media.getAttribute("src")?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0])) || (label ? `title:${label}` : null);
      return {
        id,
        label,
        kind: tile.querySelector(ui.sceneTile) ? "scene" : tile.querySelector(ui.videoTile) ? "video" : tile.querySelector(ui.imageTile) ? "image" : "other",
        progress: tile.innerText.match(/\d+%/)?.[0] ?? null,
        failed: Boolean(tile.querySelector(ui.errorTile)),
      };
    });
  }, UI);
}

const tileByLabel = (page, label, extra = "") => page.locator(`${UI.tile}[aria-label="${quoted(label)}"]${extra}`).first();
const tileById = (page, id) =>
  id.startsWith("title:") ? tileByLabel(page, id.slice(6)) : page.locator(`${UI.tile}:has([data-media-id="${id}"]), ${UI.tile}:has([src*="${id}"])`).first();

// Flow only reveals a tile's toolbar after a genuine pointer move over it.
async function hover(page, target) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  else await target.hover();
  await sleep(page, 900);
}

async function openTileMenu(page, tile) {
  await hover(page, tile);
  const more = tile.getByRole("button", { name: UI.more });
  if (await visible(more, 3000)) await more.click();
  else await tile.click({ button: "right" });
}

// Walks the whole grid from the top, collecting every titled tile. `until` stops the walk early and leaves the grid
// scrolled where the wanted tile is still mounted.
async function scanGrid(page, until) {
  await dismissOverlays(page);
  await page.getByRole("navigation", { name: UI.nav }).getByText("All media", { exact: true }).click().catch(() => {});
  await sleep(page, 600);
  await scrollToTop(page);
  const seen = new Map();
  for (let step = 0; step < 200; step++) {
    for (const t of await readTiles(page)) {
      if (!t.label) continue;
      const id = t.id?.startsWith("title:") ? undefined : t.id;
      const known = seen.get(t.label);
      if (!known) seen.set(t.label, { name: t.label, kind: t.kind === "other" ? "image" : t.kind, id, duplicates: 1 });
      else if (id && known.id && known.id !== id) known.duplicates++;
      else if (id && !known.id) known.id = id;
    }
    if (until?.([...seen.values()])) break;
    if (!(await scrollDown(page))) break;
    await sleep(page, 700);
  }
  return [...seen.values()];
}

const assetTile = (page, asset) => tileByLabel(page, asset.name);

// ---------------------------------------------------------------- settings and inputs

async function openSettings(page) {
  const probe = page.getByRole("radio", { name: "Image", exact: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await visible(probe)) return;
    await page.getByRole("button", { name: UI.settings }).click();
    await visible(probe, 3000);
  }
  if (!(await visible(probe))) throw new Error("Could not open Flow's generation settings. Is the project's main view showing in the Flow window?");
}

async function pick(page, name) {
  const radio = page.getByRole("radio", { name, exact: typeof name === "string" }).first();
  if (!(await visible(radio))) throw new Error(`Flow offers no "${name}" option for the current mode or model.`);
  if (!(await radio.isChecked())) {
    await radio.click();
    await sleep(page, 500);
  }
}

async function pickModel(page, model) {
  const button = page.getByRole("button", { name: UI.modelPicker });
  if ((await button.innerText()).toLowerCase().includes(model.toLowerCase())) return;
  await button.click();
  const items = page.getByRole("menuitem");
  await items.first().waitFor({ state: "visible", timeout: 5000 });
  const names = (await items.allInnerTexts()).map(oneLine);
  const index = names.findIndex((n) => n.toLowerCase().includes(model.toLowerCase()));
  if (index < 0) {
    await page.keyboard.press("Escape");
    throw new Error(`Flow has no model called "${model}" here. It offers: ${names.join(", ")}`);
  }
  await items.nth(index).click();
  await sleep(page, 700);
}

// Applies the scene's settings and returns the price Flow itself quotes for them.
async function applySettings(page, s) {
  const frames = Boolean(s.first_frame || s.last_frame);
  await openSettings(page);
  await pick(page, s.type === "image" ? "Image" : "Video");
  if (s.type === "video") await pick(page, frames ? "Frames" : "Ingredients");
  if (s.aspect_ratio) await pick(page, s.aspect_ratio);
  if (s.model) await pickModel(page, s.model);
  if (s.type === "video" && s.resolution) await pick(page, new RegExp(`^${s.resolution}`));
  if (s.type === "video" && s.duration) await pick(page, `${s.duration}s`);
  await pick(page, `x${s.variants ?? 1}`);
  await sleep(page, 600);
  const text = await page.getByRole("link", { name: UI.quote }).innerText();
  const cost = Number(text.match(/\d+/)?.[0] ?? NaN);
  await page.keyboard.press("Escape");
  await sleep(page, 400);
  if (Number.isNaN(cost)) throw new Error(`Could not read Flow's credit quote ("${oneLine(text)}"). Nothing was generated.`);
  return cost;
}

// Puts a local file into the project under a unique name and waits until Flow has finished processing it.
// "asset:<title>" names something already in the project (image, clip, character) and skips the upload.
async function provide(page, job, file, role) {
  if (file.startsWith(ASSET)) return file.slice(ASSET.length).trim();
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const name = `${OWN_UPLOAD}${job.id}-${role}${extname(file).toLowerCase()}`;
  const staged = join(mkdtempSync(join(tmpdir(), "flow-studio-")), name);
  copyFileSync(file, staged);
  await scrollToTop(page);
  await page.getByRole("button", { name: UI.addMedia }).click();
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.getByRole("menuitem", { name: UI.upload, exact: true }).click();
  await (await chooser).setFiles(staged);
  await tileByLabel(page, name, ":has([data-media-id])")
    .waitFor({ state: "attached", timeout: 90_000 })
    .catch(() => {
      throw new Error(`Flow did not finish processing the upload of ${basename(file)} within 90 s.`);
    });
  await sleep(page, 1000);
  return name;
}

const optionNamed = (list, name) => list.getByRole("option", { name: new RegExp(`^${escapeRe(name)}`, "i") }).first();

// Chooses an asset in Flow's media picker. Frame pickers attach on click; the ingredients picker previews first
// and needs "Add to prompt". Characters, voices and uploads sit behind their own tabs.
async function attach(page, opener, assetName) {
  const list = page.getByRole("listbox", { name: UI.assetList });
  const all = page.getByRole("tab", { name: "All", exact: true });
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    if (attempt) {
      await page.keyboard.press("Escape");
      await sleep(page, 800);
    }
    await opener.click();
    opened = await Promise.race([visible(list, 5000), visible(all, 5000)]);
  }
  if (!opened) throw new Error(`Flow's media picker did not open while attaching "${assetName}". Nothing was generated.`);
  if ((await visible(all)) && (await all.getAttribute("aria-selected")) !== "true") {
    await all.click();
    await sleep(page, 1000);
  }
  await list.waitFor({ state: "visible", timeout: 10_000 });
  let option = optionNamed(list, assetName);
  if (!(await visible(option))) {
    for (const name of ["Characters", "Uploads", "Avatars", "Voices"]) {
      const tab = page.getByRole("tab", { name, exact: true });
      if (!(await visible(tab))) continue;
      await tab.click();
      await sleep(page, 1200);
      option = optionNamed(list, assetName);
      if (await visible(option)) break;
    }
  }
  if (!(await visible(option, 10_000))) {
    await page.keyboard.press("Escape");
    throw new Error(`Nothing called "${assetName}" in the Flow project. Nothing was generated.`);
  }
  await option.click();
  const add = page.getByRole("button", { name: UI.addToPrompt, exact: true });
  if (await visible(add, 1500)) await add.click().catch(() => {});
  await list.waitFor({ state: "hidden", timeout: 10_000 });
  await sleep(page, 500);
}

// Enter submits in Flow, so a prompt always goes in as one line.
async function typePrompt(page, prompt, { box = page.locator(UI.promptBox).first(), clearKey = "Delete" } = {}) {
  await box.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press(clearKey);
  await page.keyboard.type(oneLine(prompt), { delay: 8 });
  await sleep(page, 500);
}

async function pressStart(page, refusal) {
  const start = page.getByRole("button", { name: UI.start });
  if (!(await start.isEnabled())) throw new Error(refusal);
  return start;
}

// ---------------------------------------------------------------- waiting for results

const isResult = (tile, before, kind) => tile.id && !before.has(tile.id) && !tile.label.startsWith(OWN_UPLOAD) && !tile.progress && !tile.failed && (!kind || tile.kind === kind);

// A failed generation leaves an error tile with Flow's own free Retry. Only error tiles above the first tile that
// existed before this job count; older failures further down are not ours.
function newFailures(tiles, before) {
  let count = 0;
  for (const tile of tiles) {
    if (tile.id && before.has(tile.id)) break;
    if (tile.failed) count++;
  }
  return count;
}

async function retryFailedTile(page) {
  const tile = page.locator(`${UI.tile}:has(${UI.errorTile})`).first();
  await hover(page, tile);
  const retry = tile.getByRole("button", { name: "Retry" });
  if (!(await visible(retry, 2000))) return false;
  await retry.click({ timeout: 10_000 });
  await sleep(page, 1500);
  await scrollToTop(page);
  return true;
}

async function waitForResults(page, before, count, timeout, job, kind) {
  const deadline = Date.now() + timeout;
  let retries = job?.params?.retries ?? 1;
  while (Date.now() < deadline) {
    await sleep(page, 2000);
    const tiles = await readTiles(page);
    const done = [...new Set(tiles.filter((t) => isResult(t, before, kind)).map((t) => t.id))];
    if (done.length >= count) return done.slice(0, count);
    const rendering = tiles.slice(0, 8).map((t) => t.progress).filter(Boolean);
    if (job) job.progress = rendering.join(", ") || "waiting for Flow";
    if (rendering.length || !newFailures(tiles, before)) continue;
    if (retries > 0) {
      retries--;
      if (job) job.progress = "Flow failed the render, retrying inside Flow";
      if (await retryFailedTile(page)) continue;
    }
    if (done.length) return done;
    throw new Error("Flow failed this generation and says nothing was charged. Try again later or reword the prompt.");
  }
  throw new Error(`Timed out after ${Math.round(timeout / 1000)} s waiting for Flow. If Flow finished later, the result is in the project: download it from the Library instead of generating again.`);
}

// ---------------------------------------------------------------- downloads

const SYSTEM_DOWNLOADS = join(homedir(), "Downloads");
const DOWNLOAD_DIRS = [DOWNLOAD_DIR, SYSTEM_DOWNLOADS];

// The browser is told to save into a folder this tool owns. Another DevTools client can reset that browser-wide, so it
// is set again before every download, and the system Downloads folder is watched as well.
async function claimDownloads(page) {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: DOWNLOAD_DIR, eventsEnabled: true }).catch(() => {});
  await cdp.detach().catch(() => {});
}

function downloadsNow() {
  const seen = new Set();
  for (const dir of DOWNLOAD_DIRS) if (existsSync(dir)) for (const f of readdirSync(dir)) seen.add(join(dir, f));
  return seen;
}

async function awaitDownload(page, before, timeout) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    await sleep(page, 1000);
    for (const path of downloadsNow()) {
      const name = basename(path);
      if (before.has(path) || name.startsWith(".") || /\.(crdownload|part|tmp)$/i.test(name)) continue;
      const size = statSync(path).size;
      if (last?.path === path && last.size === size && size > 0) return path;
      last = { path, size };
    }
  }
  throw new Error("Flow started a download but no file arrived, either in this tool's folder or in ~/Downloads.");
}

// Downloads arrive under a bare id with no extension, so the type is read from the first bytes.
function sniff(file) {
  const head = Buffer.alloc(12);
  const fd = openSync(file, "r");
  try {
    readSync(fd, head, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  const ascii = (from, to) => head.subarray(from, to).toString("latin1");
  if (head[0] === 0xff && head[1] === 0xd8) return ".jpg";
  if (ascii(1, 4) === "PNG") return ".png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return ".webp";
  if (ascii(4, 8) === "ftyp") return ".mp4";
  if (ascii(0, 4) === "GIF8") return ".gif";
  if (ascii(0, 2) === "PK") return ".zip";
  return ".bin";
}

function unzip(zip, dest) {
  try {
    execFileSync("unzip", ["-o", "-q", zip, "-d", dest], { stdio: "ignore" });
  } catch {
    execFileSync("python3", ["-m", "zipfile", "-e", zip, dest], { stdio: "ignore" });
  }
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      if (f.startsWith(".") || f === "__MACOSX") continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dest);
  return files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Moves a finished download to <stem>.<ext>. A tile holding several takes downloads as a ZIP; its takes become
// <stem>, <stem>-v2, ...
function keep(file, stem) {
  const ext = sniff(file);
  if (ext !== ".zip") {
    const target = `${stem}${ext}`;
    renameSync(file, target);
    return [target];
  }
  const takes = unzip(file, mkdtempSync(join(tmpdir(), "flow-studio-takes-")));
  if (!takes.length) throw new Error("Flow sent a ZIP with nothing usable inside.");
  return takes.map((take, i) => {
    const target = `${stem}${i ? `-v${i + 1}` : ""}${sniff(take)}`;
    copyFileSync(take, target);
    return target;
  });
}

// `find` is called again on every attempt: the virtual grid can unmount and remount a tile between steps.
async function downloadTile(page, find, stem, quality = "original") {
  await claimDownloads(page);
  mkdirSync(join(stem, ".."), { recursive: true });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tile = await find();
      const before = downloadsNow();
      await openTileMenu(page, tile);
      const download = page.getByRole("menuitem", { name: "Download", exact: true });
      if (!(await visible(download, 8000))) {
        const offered = await page.locator('[role="menuitem"]').evaluateAll((items) => items.map((m) => (m.textContent ?? "").replace(/\s+/g, " ").trim()));
        throw new Error(offered.length ? `Flow's tile menu has no Download item. It offered: ${offered.join(" | ")}` : "Flow's tile menu did not open.");
      }
      await download.click({ timeout: 10_000 });
      // A size submenu follows: the original, or the best upscale the plan allows.
      const original = page.getByRole("menuitem", { name: /original/i }).first();
      if (await visible(original, 3000)) {
        const upscaled = page.locator('[role="menuitem"]:not([aria-disabled="true"]):not([disabled])').filter({ hasText: /upscaled/i }).first();
        await (quality === "upscaled" && (await visible(upscaled)) ? upscaled : original).click();
      }
      const file = await awaitDownload(page, before, quality === "upscaled" ? 600_000 : 180_000);
      const saved = keep(file, stem);
      await page.keyboard.press("Escape");
      await scrollToTop(page);
      return saved;
    } catch (err) {
      lastError = err;
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(page, 2000);
    }
  }
  throw lastError;
}

async function downloadResult(page, id, stem, quality) {
  await scrollToTop(page);
  await sleep(page, 2500);
  const first = tileById(page, id);
  await first.waitFor({ state: "visible", timeout: 30_000 });
  const title = await first.getAttribute("aria-label").catch(() => null);
  const find = async () => {
    const byId = tileById(page, id);
    if (await byId.count()) return byId;
    const byTitle = title ? tileByLabel(page, title, ":has([src])") : null;
    if (byTitle && (await byTitle.count())) return byTitle;
    throw new Error(`The finished tile${title ? ` ("${title}")` : ""} is no longer in view. It is still in the Flow project: download it from the Library, free.`);
  };
  return downloadTile(page, find, stem, quality);
}

// Flow titles results itself and reuses titles; giving each result this tool's own name makes it findable later.
async function renameTile(page, tile, title) {
  try {
    await openTileMenu(page, tile);
    const rename = page.getByRole("menuitem", { name: "Rename", exact: true });
    if (!(await visible(rename, 4000))) {
      await page.keyboard.press("Escape");
      return false;
    }
    await rename.click();
    await sleep(page, 1200);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(title, { delay: 8 });
    await page.keyboard.press("Enter");
    await sleep(page, 1500);
    return true;
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
}

// ---------------------------------------------------------------- generate

// Runs one scene: settings, price check, inputs, prompt, generate, wait, download. Returns the saved files.
export async function generate(job) {
  const page = await requireProject();
  const s = job.params;
  await openGrid(page);
  await emptyComposer(page);

  job.progress = "reading Flow's price";
  job.credits = await applySettings(page, s);
  if (job.credits > s.max_credits) {
    throw new Error(`Flow quotes ${job.credits} credits for this scene, above the limit of ${s.max_credits}. Nothing was generated. Raise max_credits, or choose a cheaper model, length or take count.`);
  }

  // Flow's composer takes frames or ingredients, never both. Frames already pin the look, so they win.
  const frames = s.type === "video" && Boolean(s.first_frame || s.last_frame);
  let references = s.reference_images ?? [];
  if (frames && references.length) {
    addNote(job, `${references.length} reference(s) skipped: Flow accepts start/end frames or references, not both`);
    references = [];
  }
  job.progress = "attaching inputs";
  if (s.first_frame) await attach(page, page.getByRole("button", { name: UI.startFrame, exact: true }), await provide(page, job, s.first_frame, "start"));
  if (s.last_frame) await attach(page, page.getByRole("button", { name: UI.endFrame, exact: true }), await provide(page, job, s.last_frame, "end"));
  for (const [i, ref] of references.entries()) {
    await attach(page, page.getByRole("button", { name: UI.ingredients }), await provide(page, job, ref, `ref${i + 1}`));
  }
  if (references.length) {
    const attached = await page.getByRole("button", { name: UI.ingredientChip }).count();
    if (attached < references.length) throw new Error(`Only ${attached} of ${references.length} references attached in Flow. Nothing was generated.`);
  }

  await typePrompt(page, s.prompt);
  const start = await pressStart(page, "Flow's generate button is disabled: it did not accept the prompt or its inputs. Nothing was generated.");
  await scrollToTop(page);
  const before = new Set((await readTiles(page)).map((t) => t.id).filter(Boolean));
  await start.click();
  job.progress = "generating";

  const ids = await waitForResults(page, before, s.variants ?? 1, s.type === "image" ? IMAGE_TIMEOUT : VIDEO_TIMEOUT, job, s.type);
  mkdirSync(s.output_dir, { recursive: true });
  const files = [];
  for (const [i, id] of ids.entries()) {
    const label = ids.length > 1 ? `${s.file_stem}-v${i + 1}` : s.file_stem;
    const flowTitle = `${basename(s.output_dir)}-${label}`;
    job.progress = "downloading";
    if (await renameTile(page, tileById(page, id), flowTitle)) (job.flow_titles ??= []).push(flowTitle);
    await sleep(page, 800);
    files.push(...(await downloadResult(page, id, join(s.output_dir, label), s.download_quality)));
    await sleep(page, 1500);
  }
  job.progress = undefined;
  return files;
}

// ---------------------------------------------------------------- library

export async function listAssets() {
  const page = await requireProject();
  const assets = await scanGrid(page);
  await scrollToTop(page);
  return assets.filter((a) => !a.name.startsWith(OWN_UPLOAD));
}

// A scene's tile menu would download a ZIP of loose clips; from inside the scene view it exports as one film.
// Nothing may be pressed while Flow exports.
async function downloadScene(page, scene, stem) {
  await claimDownloads(page);
  const tile = assetTile(page, scene);
  await hover(page, tile);
  await tile.click();
  await page.waitForURL(/\/scene\//, { timeout: 30_000 });
  await sleep(page, 3000);
  const before = downloadsNow();
  await page.getByRole("button", { name: "Download scene", exact: true }).click();
  const saved = keep(await awaitDownload(page, before, 600_000), stem);
  await page.getByRole("button", { name: UI.back }).click().catch(() => {});
  await sleep(page, 2000);
  await openGrid(page).catch(() => {});
  return saved;
}

// Downloads something already in the project, matched by the start of its title. Free, including the upscale.
export async function downloadAsset(name, stem, quality = "original") {
  const page = await requireProject();
  const wanted = (a) => a.name.toLowerCase().startsWith(name.toLowerCase());
  const found = (await scanGrid(page, (assets) => assets.some(wanted))).find(wanted);
  if (!found) throw new Error(`Nothing in the Flow project has a title starting with "${name}".`);
  mkdirSync(join(stem, ".."), { recursive: true });
  if (found.kind === "scene") return downloadScene(page, found, stem);
  return downloadTile(page, async () => assetTile(page, found), stem, quality);
}

// Moves one item to Flow's Trash, where Flow keeps it restorable. Flow asks for no confirmation, so callers must.
// The title has to match exactly and be unique: trashing the wrong item is the worst outcome here.
export async function trashAsset(name) {
  const page = await requireProject();
  await openGrid(page);
  const same = (await scanGrid(page)).filter((a) => a.name === name);
  if (!same.length) throw new Error(`Nothing in the open Flow project is titled exactly "${name}".`);
  if (same.length > 1 || same[0].duplicates > 1) throw new Error(`More than one item is titled "${name}", so it is not clear which to trash. Rename one in Flow first.`);
  await scanGrid(page, (seen) => seen.some((a) => a.name === name));
  const tile = assetTile(page, same[0]);
  await openTileMenu(page, tile);
  await page.getByRole("menuitem", { name: "Move to trash", exact: true }).click();
  await sleep(page, 2000);
  if (await tile.count()) throw new Error(`"${name}" is still in the project: Flow did not move it to Trash.`);
  await scrollToTop(page);
  return { trashed: name, restore: "Open Trash in Flow to restore it." };
}

// ---------------------------------------------------------------- cast

const readCast = () => {
  try {
    return JSON.parse(readFileSync(CAST_FILE, "utf8"));
  } catch {
    return {};
  }
};
// A character's written description, kept so scenes can restate it: Flow has no memory between scenes.
export const characterLook = (name) => readCast()[name.toLowerCase()];
export function rememberLook(name, look) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(CAST_FILE, JSON.stringify({ ...readCast(), [name.toLowerCase()]: look.trim() }, null, 2));
}

const CAST_DIR = join(OUT, "_cast");
const openCharacters = async (page) => {
  await dismissOverlays(page);
  await page.getByRole("navigation", { name: UI.nav }).getByText("Characters", { exact: true }).click();
  await sleep(page, 2500);
};
const doneEditing = (page) => page.getByRole("button", { name: /^Done( editing)?$/ }).first();

// A run that stopped half-way can leave Flow inside a character's editor, where the project navigation is hidden.
async function leaveCharacterEditor(page) {
  if (/\/character(\/|$)/.test(new URL(page.url()).pathname)) {
    await doneEditing(page).click({ timeout: 5000 }).catch(() => {});
    await page.waitForURL((u) => !/\/character/.test(u.pathname), { timeout: 10_000 }).catch(() => {});
  }
  await openGrid(page).catch(() => {});
}

export async function listCharacters() {
  const page = await requireProject();
  await leaveCharacterEditor(page);
  await openCharacters(page);
  const names = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((t) => t.innerText.replace(/\s+/g, " ").trim()), UI.characterTile);
  await openGrid(page).catch(() => {});
  // Icon ligatures render as words inside the tile text.
  const clean = names.map((n) => n.replace(/\b(accessibility_new|person|movie|image|videocam|mic)\b/g, "").replace(/\s+/g, " ").trim());
  return [...new Set(clean)].filter((n) => n && n !== "Me").map((name) => ({ name, look: characterLook(name) }));
}

async function savePortrait(page, name) {
  await claimDownloads(page);
  mkdirSync(CAST_DIR, { recursive: true });
  const picture = page.getByRole("img", { name: UI.portrait }).first();
  const button = page.getByRole("button", { name: "Download image", exact: true });
  const before = downloadsNow();
  let pressed = false;
  for (let attempt = 0; attempt < 3 && !pressed; attempt++) {
    await hover(page, picture);
    pressed = await button.click({ timeout: 4000 }).then(() => true, () => false);
  }
  if (!pressed) throw new Error("Flow never showed the portrait's download button");
  return keep(await awaitDownload(page, before, 90_000), join(CAST_DIR, safeName(name)))[0];
}

// Creates a reusable character. From a description, Flow first draws the portrait as a free still; the character is
// then built from that picture. Afterwards any scene can reference it as "asset:<name>".
export async function createCharacter(job) {
  const c = job.params;
  let page = await requireProject();
  let image = c.image;
  let portrait;
  if (!image) {
    job.progress = "drawing the portrait";
    const drawn = await generate({
      id: job.id,
      params: { prompt: c.describe, type: "image", max_credits: 0, aspect_ratio: c.aspect_ratio ?? "3:4", output_dir: CAST_DIR, file_stem: safeName(c.name) },
    });
    image = portrait = drawn[0];
    page = await getFlowPage();
  }
  const projectUrl = page.url();
  job.progress = "building the character";
  await scrollToTop(page);
  await openCharacters(page);
  // With no characters yet, Flow goes straight to the creation page.
  const create = page.getByRole("button", { name: "New character" });
  if (await visible(create)) await create.click();
  await page.waitForURL(/\/character$/, { timeout: 15_000 });

  if (image.startsWith(ASSET)) {
    const title = image.slice(ASSET.length).trim();
    await page.getByRole("button", { name: "Add from project", exact: true }).click();
    const list = page.getByRole("listbox", { name: UI.assetList });
    await list.waitFor({ state: "visible", timeout: 10_000 });
    let option = optionNamed(list, title);
    if (!(await visible(option))) {
      await page.getByRole("tab", { name: "Uploads" }).click();
      await sleep(page, 1000);
      option = optionNamed(list, title);
    }
    if (!(await visible(option))) {
      await page.keyboard.press("Escape");
      throw new Error(`No image titled "${title}" in the Flow project.`);
    }
    await option.click();
    await page.getByRole("button", { name: "Add media", exact: true }).click();
  } else {
    if (!existsSync(image)) throw new Error(`File not found: ${image}`);
    const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
    await page.getByRole("button", { name: UI.upload, exact: true }).click();
    await (await chooser).setFiles(image);
  }
  await page.waitForURL(/\/character\/[0-9a-f-]{36}/, { timeout: 90_000 });

  const nameBox = page.getByRole("textbox", { name: "Character name" });
  await nameBox.waitFor({ state: "visible", timeout: 15_000 });
  await nameBox.fill(c.name);
  await nameBox.press("Enter");
  if (c.personality) await page.getByRole("textbox", { name: "Character personality" }).fill(c.personality);

  if (c.voice) {
    await page.getByRole("button", { name: "Select a voice" }).click();
    const voices = page.getByRole("listbox", { name: UI.assetList });
    await voices.waitFor({ state: "visible", timeout: 10_000 });
    const option = optionNamed(voices, c.voice);
    if (await visible(option)) {
      await option.click();
      await page.getByRole("button", { name: "Add to character", exact: true }).click();
      await sleep(page, 1000);
    } else {
      await page.getByRole("dialog").getByRole("button", { name: "Close" }).click().catch(() => page.keyboard.press("Escape"));
      addNote(job, `Flow has no stock voice called "${c.voice}", so the character was made without a voice`);
    }
  }

  await doneEditing(page).click();
  await page.waitForURL((u) => !/\/character/.test(u.pathname), { timeout: 15_000 }).catch(() => page.goto(projectUrl));
  await sleep(page, 1000);
  await emptyComposer(page);
  await openGrid(page).catch(() => {});
  if (c.describe) rememberLook(c.name, c.describe);
  job.progress = undefined;
  return portrait ? [portrait] : [];
}

// Redraws an existing character in place (free). Name, personality and voice are kept, so later scenes use the new
// look. Without `look` it only saves the current portrait to disk.
export async function editCharacter(job) {
  const { name, look } = job.params;
  const page = await requireProject();
  await leaveCharacterEditor(page);
  await openCharacters(page);
  const card = page.locator(UI.characterTile).filter({ hasText: name }).first();
  if (!(await visible(card))) throw new Error(`There is no character called "${name}" in this Flow project.`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForURL(/\/character\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await sleep(page, 2000);

  if (look) {
    const picture = page.getByRole("img", { name: UI.portrait }).first();
    const before = await picture.getAttribute("src").catch(() => null);
    // The editor draws a wide picture and, unprompted, fills it with copies of the character.
    const change = `${oneLine(look).replace(/[.\s]*$/, ".")} Exactly one ${name} in the picture: no copies of ${name} and no extra poses side by side.`;
    await typePrompt(page, change, { box: page.locator(UI.promptBox).last(), clearKey: "Backspace" });
    await (await pressStart(page, "Flow did not accept the change: its generate button stayed disabled.")).click();
    const deadline = Date.now() + 4 * 60_000;
    for (;;) {
      await sleep(page, 3000);
      const now = await picture.getAttribute("src").catch(() => null);
      job.progress = (await page.locator("main").first().innerText()).match(/\d+%/)?.[0] ?? "redrawing";
      if (now && now !== before && !/%/.test(job.progress)) break;
      if (Date.now() > deadline) throw new Error("Timed out waiting for Flow to redraw the character.");
    }
  }

  // From here the edit already exists in Flow; a failed download must not report the whole edit as failed.
  const files = [];
  try {
    files.push(await savePortrait(page, name));
  } catch (err) {
    addNote(job, `${look ? "The character was changed in Flow, but the" : "The"} portrait could not be saved to disk (${err.message})`);
  }
  await leaveCharacterEditor(page);
  await emptyComposer(page);
  job.progress = undefined;
  return files;
}

// ---------------------------------------------------------------- restyle

// Video-to-video edit of a clip already in the project. Flow quotes no price beforehand, so the cost is measured as
// the difference in the balance.
export async function restyle(job) {
  const page = await requireProject();
  const s = job.params;
  await openGrid(page);
  const balance = await readCredits(page).catch(() => undefined);
  const before = new Set((await readTiles(page)).map((t) => t.id).filter(Boolean));
  const wanted = (a) => a.kind === "video" && a.name.toLowerCase().startsWith(s.asset.toLowerCase());
  const found = (await scanGrid(page, (assets) => assets.some(wanted))).find(wanted);
  if (!found) throw new Error(`No clip in the Flow project has a title starting with "${s.asset}".`);

  const tile = assetTile(page, found);
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await page.waitForURL(/\/edit\//, { timeout: 20_000 });
  await sleep(page, 2500);
  await typePrompt(page, s.prompt, { box: page.locator(UI.promptBox).last() });
  await (await pressStart(page, "Flow did not accept the edit: its generate button stayed disabled. Nothing was spent.")).click();

  // Progress shows as "NN%" in the edit view and disappears when the edit is ready.
  const deadline = Date.now() + EDIT_TIMEOUT;
  let started = false;
  for (;;) {
    await sleep(page, 3000);
    const pct = (await page.locator("main").first().innerText()).match(/\d+%/)?.[0];
    job.progress = pct ?? "waiting for Flow";
    if (pct) started = true;
    else if (started) break;
    if (Date.now() > deadline) throw new Error("Timed out waiting for Flow to finish the edit. If it finished later, the result is in the project: download it from the Library.");
  }

  await page.getByRole("button", { name: UI.back }).click();
  await sleep(page, 2500);
  await openGrid(page);
  const [id] = await waitForResults(page, before, 1, 90_000, undefined, "video");
  const files = await downloadResult(page, id, join(s.output_dir, s.file_stem), s.download_quality);
  const after = await readCredits(page).catch(() => undefined);
  if (balance !== undefined && after !== undefined) job.credits = balance - after;
  job.progress = undefined;
  return files;
}
