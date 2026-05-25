#!/usr/bin/env node
// Zero-dependency static + SSE server for Blunders Blitz.
//
// Endpoints:
//   GET  /              -> /public/index.html
//   GET  /<file>        -> static assets from /public
//   GET  /health        -> { ok: true, version, alert: <currentAlert|null>, port }
//   GET  /events        -> Server-Sent Events stream (alert / dismiss)
//   POST /alert         -> body { title?, message?, source? } broadcast new alert
//   POST /dismiss       -> clear active alert
//
// The state file at $STATE_DIR/state.json records port + PID so the CLI can
// re-target a running instance (or detect that none is running).

import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(PROJECT_ROOT, "public");
const PKG = JSON.parse(
  await readFile(join(PROJECT_ROOT, "package.json"), "utf-8")
);

const STATE_DIR =
  process.env.BLUNDERS_BLITZ_STATE_DIR ||
  join(homedir(), ".blunders-blitz");
const STATE_FILE = join(STATE_DIR, "state.json");

const PORT = parseInt(process.env.PORT || "7878", 10);
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

// ── in-memory state ─────────────────────────────────────────
let activeAlert = null; // { id, title, message, source, at }
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {}
  }
}

// ── helpers ─────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    "content-type": "application/json; charset=utf-8",
  });
}

async function readBody(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("payload too large");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return null;
  const buf = Buffer.concat(chunks).toString("utf-8");
  try {
    return JSON.parse(buf);
  } catch {
    return null;
  }
}

async function serveStatic(req, res) {
  // map / -> /index.html, otherwise resolve under PUBLIC_DIR
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  const safe = normalize(url).replace(/^(\.\.[\\/])+/, "");
  const filePath = join(PUBLIC_DIR, safe);
  // guard against path escape
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden");
  }
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      return send(res, 404, "Not Found");
    }
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    return send(res, 200, data, {
      "content-type": mime,
      "cache-control": "no-cache",
    });
  } catch {
    return send(res, 404, "Not Found");
  }
}

// ── routes ──────────────────────────────────────────────────
async function handle(req, res) {
  const url = req.url || "/";
  const path = url.split("?")[0];

  // CORS for cross-origin alert posts (e.g., browser dev tools) — kept permissive locally
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    return send(res, 204, "");
  }

  if (req.method === "GET" && path === "/health") {
    return sendJson(res, 200, {
      ok: true,
      name: PKG.name,
      version: PKG.version,
      port: PORT,
      host: HOST,
      uptime: process.uptime(),
      activeAlert,
    });
  }

  if (req.method === "GET" && path === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write("retry: 2000\n\n");
    res.write(
      `event: snapshot\ndata: ${JSON.stringify({ active: activeAlert })}\n\n`
    );
    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {}
    }, 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  if (req.method === "POST" && path === "/alert") {
    let body;
    try {
      body = (await readBody(req)) || {};
    } catch {
      return sendJson(res, 413, { ok: false, error: "payload too large" });
    }
    const alert = {
      id: randomUUID(),
      title: typeof body.title === "string" ? body.title.slice(0, 200) : "Needs your attention",
      message:
        typeof body.message === "string"
          ? body.message.slice(0, 2000)
          : "Your assistant is waiting on you.",
      source: typeof body.source === "string" ? body.source.slice(0, 80) : "Claude",
      at: new Date().toISOString(),
    };
    activeAlert = alert;
    broadcast("alert", alert);
    return sendJson(res, 200, { ok: true, alert });
  }

  if (req.method === "POST" && path === "/dismiss") {
    const cleared = activeAlert;
    activeAlert = null;
    broadcast("dismiss", { id: cleared ? cleared.id : null });
    return sendJson(res, 200, { ok: true, cleared });
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  return send(res, 405, "Method Not Allowed");
}

// ── state file ─────────────────────────────────────────────
async function writeStateFile() {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(
    STATE_FILE,
    JSON.stringify(
      {
        pid: process.pid,
        port: PORT,
        host: HOST,
        startedAt: new Date().toISOString(),
        // CLI always talks to the loopback even when bound to 0.0.0.0
        url: `http://127.0.0.1:${PORT}`,
      },
      null,
      2
    )
  );
}

async function clearStateFile() {
  try {
    await rm(STATE_FILE);
  } catch {}
}

// ── boot ───────────────────────────────────────────────────
const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("handler error:", err);
    try {
      send(res, 500, "Internal Server Error");
    } catch {}
  });
});

server.listen(PORT, HOST, async () => {
  await writeStateFile();
  console.log(
    `▸ Blunders Blitz listening on ${HOST}:${PORT}\n  state: ${STATE_FILE}`
  );
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`✗ port ${PORT} already in use. Set PORT=... and try again.`);
    process.exit(2);
  }
  console.error("server error:", err);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`);
  for (const c of sseClients) {
    try {
      c.end();
    } catch {}
  }
  server.close(async () => {
    await clearStateFile();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
