#!/usr/bin/env node
// Registers this MCP server with the assistants installed on this computer: `npm run register` for every one found,
// or name some (`npm run register -- codex agy`). Each assistant's own `mcp add` command does the writing.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Absolute paths, so the server starts whatever folder or PATH the assistant runs with.
const NODE = process.execPath;
const SERVER = fileURLToPath(new URL("./mcp.js", import.meta.url));
const NAME = "flow";

const CLIENTS = {
  claude: { label: "Claude Code", add: ["mcp", "add", "--scope", "user", NAME, "--", NODE, SERVER], remove: ["mcp", "remove", "--scope", "user", NAME] },
  codex: { label: "Codex", add: ["mcp", "add", NAME, "--", NODE, SERVER], remove: ["mcp", "remove", NAME] },
  agy: { label: "Antigravity (agy)", add: ["mcp", "add", NAME, NODE, SERVER], remove: ["mcp", "remove", NAME] },
};

// On Windows these commands are .cmd shims, which only a shell can start; there the line is quoted by hand.
function run(bin, args) {
  if (process.platform !== "win32") return spawnSync(bin, args, { encoding: "utf8" });
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return spawnSync([bin, ...args].map(quote).join(" "), { shell: true, encoding: "utf8" });
}

const ok = (result) => !result.error && result.status === 0;
const said = (result) => `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").pop() || String(result.error ?? "no output");

function register(bin) {
  const { label, add, remove } = CLIENTS[bin];
  if (!ok(run(bin, ["--version"]))) return `${label}: not installed, skipped`;
  let result = run(bin, add);
  if (!ok(result)) {
    // Most likely an older entry under the same name; replace it.
    run(bin, remove);
    result = run(bin, add);
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
