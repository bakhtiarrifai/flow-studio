#!/usr/bin/env node
// Syntax-checks every source file. A script rather than a shell loop, so it runs the same on Windows.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", SRC + file], { stdio: "inherit" });
}
