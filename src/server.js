// The control panel and its JSON API, on 127.0.0.1 only. Whichever process starts this first owns the Flow tab and the
// queue; any later process (a second assistant, or the panel started beside one) forwards its requests here instead.
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { HOME, OUT, PORT, TOKEN_FILE, UPLOAD_DIR } from "./config.js";
import { shapes } from "./core.js";

const NAME = "flow-studio";
const PANEL = fileURLToPath(new URL("../studio/index.html", import.meta.url));
const MAX_UPLOAD = 300 * 1024 * 1024;
const MIME = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
};

const send = (res, code, data) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};

function body(req, limit) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        fail(new Error("That file is too large."));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

const inside = (file, dir) => resolve(file).startsWith(resolve(dir) + sep);

function media(req, res, file) {
  if (!(inside(file, OUT) || inside(file, UPLOAD_DIR)) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: "Not found." });
  const { size } = statSync(file);
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
  createReadStream(file).pipe(res);
}

// Returns "owner" when this process now serves the panel, "client" when another Flow Studio process already does,
// and "none" when the port belongs to an unrelated program.
export async function startServer(studio) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const token = randomBytes(24).toString("hex");
  const hosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

  const server = createServer(async (req, res) => {
    try {
      // The Host check stops DNS rebinding; the token stops other pages on this machine from driving the queue.
      if (!hosts.has(req.headers.host ?? "")) return send(res, 403, { error: "Bad host." });
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { name: NAME });
      if (url.pathname === "/favicon.ico") return void res.writeHead(204).end();
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(readFileSync(PANEL, "utf8").replace("__TOKEN__", token));
      }
      if ((req.headers["x-flow-token"] ?? url.searchParams.get("token")) !== token) return send(res, 401, { error: "Missing or wrong token. Reload the panel." });

      if (req.method === "GET" && url.pathname === "/media") return media(req, res, url.searchParams.get("path") ?? "");
      if (req.method === "POST" && url.pathname === "/api/upload") {
        const name = basename(url.searchParams.get("name") ?? "upload").replace(/[^\w.-]+/g, "_");
        const path = join(UPLOAD_DIR, `${randomBytes(4).toString("hex")}-${name}`);
        writeFileSync(path, await body(req, MAX_UPLOAD));
        return send(res, 200, { path });
      }
      const method = url.pathname.match(/^\/api\/(\w+)$/)?.[1];
      if (req.method === "POST" && method && Object.hasOwn(shapes, method)) {
        const args = z.object(shapes[method]).parse(JSON.parse((await body(req, 1024 * 1024)).toString() || "{}"));
        return send(res, 200, await studio[method](args));
      }
      send(res, 404, { error: "Not found." });
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") : err instanceof Error ? err.message : String(err);
      send(res, 400, { error: message });
    }
  });

  const listening = await new Promise((ok) => {
    server.once("error", () => ok(false));
    server.listen(PORT, "127.0.0.1", () => ok(true));
  });
  if (listening) {
    mkdirSync(HOME, { recursive: true });
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    return "owner";
  }
  // Something holds the port. Two processes driving the same Flow tab with separate queues could generate, and
  // charge for, the same shot twice, so a sibling that is merely slow to answer is still deferred to.
  for (let attempt = 0; attempt < 6; attempt++) {
    const other = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json(), () => null);
    if (other?.name === NAME) return "client";
    if (other) return "none";
    await new Promise((r) => setTimeout(r, 1500));
  }
  return "client";
}

async function forward(method, args) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-flow-token": readFileSync(TOKEN_FILE, "utf8").trim() },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `The Flow Studio process that owns Flow answered ${res.status}.`);
  return data;
}

// Stands in for a Studio when another process owns Flow. Waits are kept short so no single request outlives the
// HTTP client's patience.
export function remoteStudio() {
  return new Proxy({}, {
    get: (_, method) => (args) => (method === "wait" ? forward("wait", { ...args, timeout_seconds: Math.min(args?.timeout_seconds ?? 40, 60) }) : forward(method, args)),
  });
}
