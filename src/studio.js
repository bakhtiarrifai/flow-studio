#!/usr/bin/env node
// Runs the control panel on its own, no assistant needed. If an assistant's process already serves it, opens that one.
import { execFile } from "node:child_process";
import { PORT } from "./config.js";
import { Studio } from "./core.js";
import { startServer } from "./server.js";

const role = await startServer(new Studio());
const url = `http://127.0.0.1:${PORT}`;
if (role === "none") {
  console.error(`Port ${PORT} is in use by another program. Set FLOW_STUDIO_PORT to a free port.`);
  process.exit(1);
}
console.log(role === "owner" ? `Flow Studio is running at ${url}  (Ctrl+C to stop)` : `Flow Studio is already being served at ${url}`);
if (!process.env.FLOW_STUDIO_NO_OPEN) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(opener, [url], () => {});
}
if (role === "client") process.exit(0);
