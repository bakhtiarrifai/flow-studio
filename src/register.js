#!/usr/bin/env node
// Registers this MCP server with the assistants installed on this computer: `npm run register` for every one found,
// or name some (`npm run register -- codex desktop`). Each assistant's own `mcp add` command does the writing, except
// Claude Desktop, which has none and keeps its servers in a JSON file.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Absolute paths, so the server starts whatever folder or PATH the assistant runs with.
const NODE = process.execPath;
const SERVER = fileURLToPath(new URL("./mcp.js", import.meta.url));
const NAME = "flow";

const CLIENTS = {
  claude: { label: "Claude Code", add: ["mcp", "add", "--scope", "user", NAME, "--", NODE, SERVER], remove: ["mcp", "remove", "--scope", "user", NAME] },
  desktop: { label: "Claude Desktop", file: desktopConfig() },
  codex: { label: "Codex", add: ["mcp", "add", NAME, "--", NODE, SERVER], remove: ["mcp", "remove", NAME] },
  agy: { label: "Antigravity (agy)", add: ["mcp", "add", NAME, NODE, SERVER], remove: ["mcp", "remove", NAME] },
  gemini: { label: "Gemini CLI", add: ["mcp", "add", "--scope", "user", NAME, NODE, SERVER], remove: ["mcp", "remove", "--scope", "user", NAME] },
};

function desktopConfig() {
  const home = homedir();
  const dir =
    process.platform === "darwin"
      ? join(home, "Library", "Application Support")
      : process.platform === "win32"
        ? (process.env.APPDATA ?? join(home, "AppData", "Roaming"))
        : (process.env.XDG_CONFIG_HOME ?? join(home, ".config"));
  return join(dir, "Claude", "claude_desktop_config.json");
}

// On Windows these commands are .cmd shims, which only a shell can start; there the line is quoted by hand.
function run(bin, args) {
  if (process.platform !== "win32") return spawnSync(bin, args, { encoding: "utf8" });
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return spawnSync([bin, ...args].map(quote).join(" "), { shell: true, encoding: "utf8" });
}

const ok = (result) => !result.error && result.status === 0;
const said = (result) => `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").pop() || String(result.error ?? "no output");

// Adds one entry and keeps everything else in the file. A file that cannot be read as JSON is left alone.
function registerInFile(label, file) {
  if (!existsSync(dirname(file))) return `${label}: not installed, skipped`;
  let config = {};
  try {
    const text = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
    if (text) config = JSON.parse(text);
  } catch {
    return `${label}: FAILED (${file} is not valid JSON, so it was left untouched)`;
  }
  config.mcpServers = { ...config.mcpServers, [NAME]: { command: NODE, args: [SERVER] } };
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  return `${label}: registered as "${NAME}" (quit and reopen it to load the server)`;
}

function register(name) {
  const { label, file, add, remove } = CLIENTS[name];
  if (file) return registerInFile(label, file);
  if (!ok(run(name, ["--version"]))) return `${label}: not installed, skipped`;
  let result = run(name, add);
  if (!ok(result)) {
    // Most likely an older entry under the same name; replace it.
    run(name, remove);
    result = run(name, add);
  }
  return ok(result) ? `${label}: registered as "${NAME}"` : `${label}: FAILED (${said(result)})`;
}

const asked = process.argv.slice(2);
const unknown = asked.filter((name) => !CLIENTS[name]);
if (unknown.length) {
  console.error(`Unknown assistant: ${unknown.join(", ")}. Choose from: ${Object.keys(CLIENTS).join(", ")}.`);
  process.exit(1);
}

const lines = (asked.length ? asked : Object.keys(CLIENTS)).map(register);
console.log(lines.join("\n"));
console.log(`\nAny other MCP client: command ${JSON.stringify(NODE)}, args ${JSON.stringify([SERVER])}`);
process.exit(lines.some((l) => l.includes("FAILED")) ? 1 : 0);
