import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { chromium } from "playwright-core";
import { CDP_PORT, FLOW_URL, PROFILE_DIR } from "./config.js";

const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const FLOW_HOSTS = /^https:\/\/(flow\.google\.com|labs\.google\/fx)/;

// Any Chromium-family browser speaks the DevTools protocol, so Chrome is preferred but not required.
const BINARIES = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "microsoft-edge", "microsoft-edge-stable", "brave-browser"];
const MAC_APPS = ["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser"];
const WIN_APPS = ["Google\\Chrome\\Application\\chrome.exe", "Microsoft\\Edge\\Application\\msedge.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe", "Chromium\\Application\\chrome.exe"];

// Where each platform installs them when they are not on PATH, which is the normal case on macOS and Windows.
function fixedPaths() {
  if (process.platform === "darwin") {
    return MAC_APPS.flatMap((app) => ["/Applications", join(homedir(), "Applications")].map((root) => join(root, `${app}.app`, "Contents", "MacOS", app)));
  }
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    return WIN_APPS.flatMap((app) => roots.map((root) => join(root, app)));
  }
  return [];
}

export function findBrowser() {
  const override = process.env.FLOW_STUDIO_BROWSER;
  if (override) {
    if (!existsSync(override)) throw new Error(`FLOW_STUDIO_BROWSER points at "${override}", which does not exist.`);
    return override;
  }
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const name of BINARIES) {
    for (const dir of dirs) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  const fixed = fixedPaths().find((p) => existsSync(p));
  if (fixed) return fixed;
  throw new Error("No Chrome, Chromium, Edge or Brave found. Install one, or set FLOW_STUDIO_BROWSER to its executable.");
}

async function cdpUp() {
  try {
    return (await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

// A real browser on its own profile: Google sign-in behaves normally, the session persists between runs, and the
// everyday browser profile is never touched.
async function launch() {
  const bin = findBrowser();
  mkdirSync(PROFILE_DIR, { recursive: true });
  const extra = (process.env.FLOW_STUDIO_BROWSER_ARGS ?? "").split(" ").filter(Boolean);
  const child = spawn(
    bin,
    [`--user-data-dir=${PROFILE_DIR}`, `--remote-debugging-port=${CDP_PORT}`, "--no-first-run", "--no-default-browser-check", ...extra, FLOW_URL],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  for (let i = 0; i < 40; i++) {
    if (await cdpUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${bin} started, but its DevTools port ${CDP_PORT} never came up.`);
}

let browser = null;

export async function getBrowser() {
  if (browser?.isConnected()) return browser;
  if (!(await cdpUp())) await launch();
  browser = await chromium.connectOverCDP(CDP_URL);
  return browser;
}

export async function getFlowPage() {
  const b = await getBrowser();
  const context = b.contexts()[0];
  if (!context) throw new Error("The Flow browser has no open context. Close it and run `npm run login` again.");
  const open = context.pages().find((p) => FLOW_HOSTS.test(p.url()));
  if (open) return open;
  const page = await context.newPage();
  await page.goto(FLOW_URL, { waitUntil: "domcontentloaded" });
  // A signed-out visitor is redirected to the marketing page a moment after load; let the address settle first.
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  return page;
}
