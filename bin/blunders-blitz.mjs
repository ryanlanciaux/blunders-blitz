#!/usr/bin/env node
// blunders-blitz CLI — control the local chess companion.
//
// Subcommands:
//   start          [--port N] [--no-open] [--foreground]
//   stop
//   status
//   alert          "<message>" [--title T] [--source S]
//   dismiss
//   install-skill  [--dir <skills-dir>] [--force]

import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm, copyFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { setTimeout as wait } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const STATE_DIR =
  process.env.BLUNDERS_BLITZ_STATE_DIR ||
  join(homedir(), ".blunders-blitz");
const STATE_FILE = join(STATE_DIR, "state.json");
const LOG_FILE = join(STATE_DIR, "server.log");
const DEFAULT_PORT = parseInt(process.env.BLUNDERS_BLITZ_PORT || "7878", 10);

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function readState() {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function isRunning(state) {
  if (!state || !state.pid || !state.port) return false;
  try {
    process.kill(state.pid, 0);
  } catch (err) {
    if (err.code === "ESRCH") return false;
    if (err.code === "EPERM") return true; // exists, not ours
  }
  // confirm health endpoint responds
  try {
    const r = await fetch(`http://${state.host || "127.0.0.1"}:${state.port}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

function openInBrowser(url) {
  const cmds = {
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
  };
  const choice = cmds[platform()] || cmds.linux;
  try {
    const child = spawn(choice[0], choice[1], { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // silent — user can open manually
  }
}

async function cmdStart(flags) {
  const existing = await readState();
  if (await isRunning(existing)) {
    console.log(`▸ already running at ${existing.url}`);
    if (!flags["no-open"]) openInBrowser(existing.url);
    return 0;
  }

  const port = parseInt(flags.port || DEFAULT_PORT, 10);
  await mkdir(STATE_DIR, { recursive: true });
  const serverScript = join(PROJECT_ROOT, "server", "server.mjs");

  if (flags.foreground) {
    const child = spawn(process.execPath, [serverScript], {
      env: { ...process.env, PORT: String(port) },
      stdio: "inherit",
    });
    child.on("exit", (code) => process.exit(code || 0));
    return 0;
  }

  // detached background
  const fd = await import("node:fs").then((m) =>
    m.openSync(LOG_FILE, "a")
  );
  const child = spawn(process.execPath, [serverScript], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  child.unref();

  // wait briefly for the server to listen
  const url = `http://127.0.0.1:${port}`;
  let ok = false;
  for (let i = 0; i < 25; i++) {
    await wait(80);
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) {
        ok = true;
        break;
      }
    } catch {}
  }
  if (!ok) {
    console.error(`✗ server did not respond on ${url} (check ${LOG_FILE})`);
    return 2;
  }
  console.log(`▸ Blunders Blitz ready at ${url}`);
  console.log(`  logs:   ${LOG_FILE}`);
  console.log(`  state:  ${STATE_FILE}`);
  if (!flags["no-open"]) {
    openInBrowser(url);
  }
  return 0;
}

async function cmdStop() {
  const state = await readState();
  if (!state) {
    console.log("▸ not running");
    return 0;
  }
  try {
    process.kill(state.pid, "SIGTERM");
    console.log(`▸ stopped (pid ${state.pid})`);
  } catch (err) {
    if (err.code === "ESRCH") {
      console.log("▸ not running (stale state)");
    } else {
      console.error("✗ failed to stop:", err.message);
      return 1;
    }
  }
  try {
    await rm(STATE_FILE);
  } catch {}
  return 0;
}

async function cmdStatus() {
  const state = await readState();
  if (!state || !(await isRunning(state))) {
    console.log("status: stopped");
    return 0;
  }
  try {
    const r = await fetch(`${state.url}/health`);
    const data = await r.json();
    console.log(`status:  running`);
    console.log(`url:     ${state.url}`);
    console.log(`pid:     ${state.pid}`);
    console.log(`uptime:  ${data.uptime ? data.uptime.toFixed(1) + "s" : "n/a"}`);
    if (data.activeAlert) {
      console.log(`alert:   "${data.activeAlert.title}" (from ${data.activeAlert.source})`);
    } else {
      console.log(`alert:   none`);
    }
  } catch (err) {
    console.error("✗ failed to query server:", err.message);
    return 1;
  }
  return 0;
}

async function ensureRunning() {
  const state = await readState();
  if (!(await isRunning(state))) {
    console.error(
      "✗ Blunders Blitz is not running. Start it first with: blunders-blitz start"
    );
    process.exit(2);
  }
  return state;
}

async function cmdAlert(args) {
  const state = await ensureRunning();
  const message = args._.join(" ").trim();
  if (!message && !args.flags.title) {
    console.error(
      'usage: blunders-blitz alert "<message>" [--title "Title"] [--source "Claude"]'
    );
    return 1;
  }
  const body = {
    message: message || undefined,
    title: typeof args.flags.title === "string" ? args.flags.title : undefined,
    source: typeof args.flags.source === "string" ? args.flags.source : undefined,
  };
  const res = await fetch(`${state.url}/alert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("✗ alert failed:", res.status, await res.text());
    return 1;
  }
  const data = await res.json();
  console.log(`▸ alert sent (id ${data.alert.id})`);
  return 0;
}

async function cmdDismiss() {
  const state = await ensureRunning();
  const res = await fetch(`${state.url}/dismiss`, { method: "POST" });
  if (!res.ok) {
    console.error("✗ dismiss failed:", res.status);
    return 1;
  }
  const data = await res.json();
  if (data.cleared) {
    console.log(`▸ dismissed alert "${data.cleared.title}"`);
  } else {
    console.log("▸ no active alert");
  }
  return 0;
}

async function cmdInstallSkill(args) {
  const target =
    (typeof args.flags.dir === "string" && args.flags.dir) ||
    join(homedir(), ".claude", "skills", "blunders-blitz");
  const source = join(PROJECT_ROOT, "skill", "SKILL.md");
  const dest = join(target, "SKILL.md");

  let exists = false;
  try {
    await stat(dest);
    exists = true;
  } catch {}
  if (exists && !args.flags.force) {
    console.error(`✗ ${dest} already exists. Re-run with --force to overwrite.`);
    return 1;
  }

  await mkdir(target, { recursive: true });
  await copyFile(source, dest);
  console.log(`▸ installed skill → ${dest}`);
  console.log(`  Restart Claude Code (or reload skills) and ask it to play chess while it works.`);
  return 0;
}

function printHelp() {
  console.log(`blunders-blitz — local chess companion CLI

Usage:
  blunders-blitz start [--port 7878] [--no-open] [--foreground]
  blunders-blitz stop
  blunders-blitz status
  blunders-blitz alert "<message>" [--title "Title"] [--source "Claude"]
  blunders-blitz dismiss
  blunders-blitz install-skill [--dir <skills-dir>] [--force]

Environment:
  BLUNDERS_BLITZ_PORT       default port for "start" (default 7878)
  BLUNDERS_BLITZ_STATE_DIR  override state directory (default ~/.blunders-blitz)

Typical usage from an assistant:
  blunders-blitz start                             # launch the game
  blunders-blitz alert "Need your input on Foo"    # ping when done
  blunders-blitz dismiss                           # clear when user replies
`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return 0;
  }
  const args = parseArgs(rest);
  switch (cmd) {
    case "start":
      return cmdStart(args.flags);
    case "stop":
      return cmdStop();
    case "status":
      return cmdStatus();
    case "alert":
      return cmdAlert(args);
    case "dismiss":
      return cmdDismiss();
    case "install-skill":
      return cmdInstallSkill(args);
    default:
      console.error(`✗ unknown command: ${cmd}\n`);
      printHelp();
      return 1;
  }
}

main().then(
  (code) => process.exit(code || 0),
  (err) => {
    console.error("✗", err.stack || err.message);
    process.exit(1);
  }
);
