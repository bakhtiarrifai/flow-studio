#!/usr/bin/env node
// Runs the control panel on its own, no assistant needed. If an assistant's process already serves it, opens that one.
import { execFile, spawn } from "node:child_process";
import { findBrowser } from "./browser.js";
import { PORT } from "./config.js";
import { Studio } from "./core.js";
import { startServer } from "./server.js";

// A newer Flow Studio may later take over the panel; this standalone one then has nothing left to do.
const role = await startServer(new Studio(), { onHandover: () => setTimeout(() => process.exit(0), 500) });
const url = `http://127.0.0.1:${PORT}`;
if (role === "none") {
  console.error(`Port ${PORT} is in use by another program. Set FLOW_STUDIO_PORT to a free port.`);
  process.exit(1);
}
console.log(role === "owner" ? `Flow Studio is running at ${url}  (Ctrl+C to stop)` : `Flow Studio is already being served at ${url}`);
// Opens in the browser Flow runs in (Chrome first; FLOW_STUDIO_BROWSER overrides), in its everyday profile, rather than
// the system default, which may be a browser Flow Studio does not use. Falls back to the default if none is found.
function openPanel() {
  try {
    spawn(findBrowser(), [url], { detached: true, stdio: "ignore" }).on("error", openDefault).unref();
  } catch {
    openDefault();
  }
}
function openDefault() {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(opener, [url], () => {});
}
if (!process.env.FLOW_STUDIO_NO_OPEN) openPanel();
if (role === "client") process.exit(0);
