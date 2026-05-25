#!/usr/bin/env node
// blunders-blitz CLI — control the local chess companion.
//
// Subcommands:
//   start             [--port N] [--no-open] [--foreground]
//   stop
//   status
//   alert             "<message>" [--title T] [--source S]
//   alert-if-running  "<message>" [--title T] [--source S]
//   dismiss
//   handle-event      (reads normalized JSON event on stdin and routes it)
//   hook <agent>      (translates an agent's native hook payload, then routes)
//                       agents: claude, codex, cursor, gemini, copilot
//   install-skill     [--dir <skills-dir>] [--force]

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

async function sendAlert(state, args) {
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

async function cmdAlert(args) {
  const state = await ensureRunning();
  return sendAlert(state, args);
}

// Like `alert`, but exits 0 silently when the server isn't running.
// Intended for Claude Code Stop hooks that should be no-ops on
// machines/sessions where the chess companion isn't active.
async function cmdAlertIfRunning(args) {
  const state = await readState();
  if (!(await isRunning(state))) return 0;
  return sendAlert(state, args);
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

// ─── Normalized event pipeline ──────────────────────────────────────────────
//
// `handle-event` is the single internal entry point for agent-hook driven
// pings. It accepts a normalized JSON event on stdin and decides what (if
// anything) to show in the chess tab. Per-agent translators (cmdHook) parse
// each agent's native payload and emit this shape.
//
// {
//   event:    "task.complete" | "input.required" | "error" | "session.start"
//   source:   "claude" | "codex" | "cursor" | "gemini" | "copilot" | string
//   message?: string        (optional — short detail to put in the modal)
//   title?:   string        (optional — overrides default title)
//   cwd?:     string
//   session_id?: string
// }
//
// Policy: task.complete / input.required / error fire alert-if-running (silent
// no-op when the chess server isn't up). session.start is intentionally
// ignored — starting a new agent session shouldn't ping a player mid-game.

const EVENT_POLICY = {
  "task.complete": { title: "Back to you", urgency: "done" },
  "input.required": { title: "Needs your input", urgency: "input" },
  error: { title: "Ran into an error", urgency: "error" },
  "session.start": null, // explicit no-op
};

async function readStdinJson() {
  if (process.stdin.isTTY) return null;
  let buf = "";
  for await (const chunk of process.stdin) buf += chunk;
  buf = buf.trim();
  if (!buf) return null;
  try {
    const parsed = JSON.parse(buf);
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

function sourceLabel(source) {
  if (!source) return undefined;
  const map = {
    claude: "Claude",
    codex: "Codex",
    cursor: "Cursor",
    gemini: "Gemini",
    copilot: "Copilot",
  };
  return map[String(source).toLowerCase()] || source;
}

async function dispatchNormalizedEvent(evt) {
  if (!evt || typeof evt !== "object") return 0;
  const policy = EVENT_POLICY[evt.event];
  if (policy === null) return 0; // explicit skip (e.g. session.start)
  if (!policy) return 0; // unknown event → silent no-op

  const state = await readState();
  if (!(await isRunning(state))) return 0;

  const fakeArgs = {
    _: evt.message ? [String(evt.message)] : [],
    flags: {
      title: typeof evt.title === "string" ? evt.title : policy.title,
      source: sourceLabel(evt.source),
    },
  };
  // sendAlert needs *some* content — guarantee at least a title.
  if (!fakeArgs._.length && !fakeArgs.flags.title) {
    fakeArgs.flags.title = policy.title;
  }
  return sendAlert(state, fakeArgs);
}

async function cmdHandleEvent() {
  const evt = await readStdinJson();
  return dispatchNormalizedEvent(evt || {});
}

// ─── Per-agent translators ──────────────────────────────────────────────────
//
// Each translator takes the agent's native payload (argv tail + stdin JSON)
// and produces a normalized event. The TRANSLATORS map is the single
// extension point — add a new agent by writing one function and registering
// it here. Translation logic for non-Claude agents (added in later releases)
// is adapted from peon-ping (MIT) — see THIRD_PARTY_NOTICES.md.

function translateClaude(argv, stdin) {
  const hookEvent = (stdin && stdin.hook_event_name) || "";
  if (hookEvent === "Notification") {
    const ntype = (stdin && stdin.notification_type) || "";
    return {
      event: "input.required",
      source: "claude",
      message: ntype ? String(ntype) : undefined,
      cwd: stdin && stdin.cwd,
      session_id: stdin && stdin.session_id,
    };
  }
  // Default for Stop and anything else: task.complete.
  return {
    event: "task.complete",
    source: "claude",
    cwd: stdin && stdin.cwd,
    session_id: stdin && stdin.session_id,
  };
}

function translateCodex(argv, stdin) {
  // Adapted from peon-ping (MIT): adapters/codex.sh
  // Codex's notify hook calls us with: <event-name> as argv[0] and an
  // optional JSON payload on stdin. The event name space is unstable
  // (Codex has shipped both `agent-turn-complete` and `agent_turn_complete`,
  // and signals permission prompts via a `notification_type` field) so we
  // normalize aggressively before bucketing.
  const rawEvent = (
    argv[0] ||
    (stdin && (stdin.hook_event_name || stdin.event || stdin.type)) ||
    "agent-turn-complete"
  )
    .toString()
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const notifType = ((stdin && stdin.notification_type) || "")
    .toString()
    .toLowerCase();

  let event;
  if (
    rawEvent.startsWith("permission") ||
    rawEvent.startsWith("approve") ||
    rawEvent === "approval-requested" ||
    rawEvent === "approval-needed" ||
    rawEvent === "input-required" ||
    rawEvent === "idle-prompt" ||
    notifType === "permission_prompt"
  ) {
    event = "input.required";
  } else if (rawEvent === "start" || rawEvent === "session-start") {
    event = "session.start";
  } else if (rawEvent.startsWith("error") || rawEvent.startsWith("fail")) {
    event = "error";
  } else {
    event = "task.complete";
  }

  const message =
    (stdin && (stdin.transcript_summary || stdin.summary || stdin.message)) ||
    undefined;
  return {
    event,
    source: "codex",
    message: typeof message === "string" ? message.slice(0, 120) : undefined,
    cwd: stdin && (stdin.cwd || stdin.workspace_root),
    session_id: stdin && (stdin.session_id || stdin.conversation_id),
  };
}

const TRANSLATORS = {
  claude: translateClaude,
  codex: translateCodex,
};

async function cmdHook(args) {
  const agent = (args._[0] || "").toLowerCase();
  if (!agent || !TRANSLATORS[agent]) {
    console.error(
      `✗ unknown hook agent: "${agent || "(none)"}"\n` +
        `  known: ${Object.keys(TRANSLATORS).join(", ")}`
    );
    return 1;
  }
  const stdin = await readStdinJson();
  const evt = TRANSLATORS[agent](args._.slice(1), stdin || {});
  if (!evt) return 0; // translator chose to skip
  return dispatchNormalizedEvent(evt);
}

function printHelp() {
  console.log(`blunders-blitz — local chess companion CLI

Usage:
  blunders-blitz start [--port 7878] [--no-open] [--foreground]
  blunders-blitz stop
  blunders-blitz status
  blunders-blitz alert "<message>" [--title "Title"] [--source "Claude"]
  blunders-blitz alert-if-running "<message>" [--title "Title"] [--source "Claude"]
  blunders-blitz dismiss
  blunders-blitz handle-event                       # reads normalized event JSON on stdin
  blunders-blitz hook <agent>                       # claude | codex | cursor | gemini | copilot
  blunders-blitz install-skill [--dir <skills-dir>] [--force]

Environment:
  BLUNDERS_BLITZ_PORT       default port for "start" (default 7878)
  BLUNDERS_BLITZ_STATE_DIR  override state directory (default ~/.blunders-blitz)

Typical usage from an assistant:
  blunders-blitz start                             # launch the game
  blunders-blitz alert "Need your input on Foo"    # ping when done
  blunders-blitz dismiss                           # clear when user replies

Wiring into an agent's hook system (preferred over manual alerts):
  Claude Code:   add a Stop hook that runs:   blunders-blitz hook claude
  Codex CLI:     notify = ["blunders-blitz", "hook", "codex"]
  See SKILL.md for full per-agent wiring.
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
    case "alert-if-running":
      return cmdAlertIfRunning(args);
    case "handle-event":
      return cmdHandleEvent();
    case "hook":
      return cmdHook(args);
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
