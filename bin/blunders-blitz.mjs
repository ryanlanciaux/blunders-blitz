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
//   install           (interactive TUI: detect tools, multiselect, patch configs)

import { spawn } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  copyFile,
  stat,
  rename,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
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

// ─── Install wizard ─────────────────────────────────────────────────────────
//
// `blunders-blitz install` is the user-facing setup flow. It detects which
// AI tools the user has installed, presents a clack-driven multiselect, and
// patches each chosen tool's config file with the right hook entry. All
// writes are atomic (tempfile + rename) and idempotent (re-running detects
// our existing entries and skips). The first edit of each file leaves a
// `.bak` alongside it.

async function existsAsync(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOrEmpty(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  // Back up the original on first edit so the user can recover by hand.
  try {
    await stat(path);
    const bak = path + ".bak";
    if (!(await existsAsync(bak))) await copyFile(path, bak);
  } catch {}
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}

async function writeJsonAtomic(path, obj) {
  await writeAtomic(path, JSON.stringify(obj, null, 2) + "\n");
}

async function detectGitRoot() {
  return new Promise((resolveP) => {
    const p = spawn("git", ["rev-parse", "--show-toplevel"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", () => resolveP(null));
    p.on("exit", (code) => resolveP(code === 0 ? out.trim() : null));
  });
}

export async function installClaude() {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const cfg = (await readJsonOrEmpty(settingsPath)) || {};
  cfg.hooks = cfg.hooks || {};
  let added = 0;
  for (const event of ["Stop", "Notification"]) {
    cfg.hooks[event] = cfg.hooks[event] || [];
    const already = cfg.hooks[event].some((wrapper) =>
      (wrapper.hooks || []).some(
        (h) => h.command && h.command.includes("blunders-blitz hook claude")
      )
    );
    if (already) continue;
    cfg.hooks[event].push({
      hooks: [{ type: "command", command: "blunders-blitz hook claude" }],
    });
    added++;
  }
  if (added) await writeJsonAtomic(settingsPath, cfg);

  // Also copy SKILL.md so Claude has the natural-language instructions.
  const skillTarget = join(homedir(), ".claude", "skills", "blunders-blitz");
  await mkdir(skillTarget, { recursive: true });
  await copyFile(
    join(PROJECT_ROOT, "skill", "SKILL.md"),
    join(skillTarget, "SKILL.md")
  );

  const hookMsg = added ? `added ${added} hook(s)` : "hooks already present";
  return `${hookMsg}; refreshed SKILL.md`;
}

export async function installCodex() {
  const cfgPath = join(homedir(), ".codex", "config.toml");
  const desiredLine = 'notify = ["blunders-blitz", "hook", "codex"]';
  let body = "";
  try {
    body = await readFile(cfgPath, "utf-8");
  } catch {}

  if (
    body.includes('"blunders-blitz"') &&
    body.includes('"hook"') &&
    body.includes('"codex"')
  ) {
    return "already wired";
  }

  // If a top-level `notify =` already exists (not inside a [section]), leave
  // it alone — overwriting the user's notify config silently would be rude.
  let inSection = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) inSection = true;
    if (!inSection && /^\s*notify\s*=/.test(line)) {
      throw new Error(
        "an existing `notify =` line is in ~/.codex/config.toml; edit it by hand"
      );
    }
  }

  if (body && !body.endsWith("\n")) body += "\n";
  await writeAtomic(cfgPath, body + desiredLine + "\n");
  return "added notify line";
}

export async function installCursor() {
  const cfgPath = join(homedir(), ".cursor", "hooks.json");
  const cfg = (await readJsonOrEmpty(cfgPath)) || {};
  cfg.hooks = cfg.hooks || [];
  const desired = [
    { event: "stop", command: "blunders-blitz hook cursor stop" },
    {
      event: "beforeShellExecution",
      command: "blunders-blitz hook cursor beforeShellExecution",
    },
    {
      event: "beforeMCPExecution",
      command: "blunders-blitz hook cursor beforeMCPExecution",
    },
  ];
  let added = 0;
  for (const entry of desired) {
    const already = cfg.hooks.some(
      (h) =>
        h.event === entry.event &&
        h.command &&
        h.command.includes("blunders-blitz hook cursor")
    );
    if (already) continue;
    cfg.hooks.push(entry);
    added++;
  }
  if (added) await writeJsonAtomic(cfgPath, cfg);
  return added ? `added ${added} hook(s)` : "already wired";
}

export async function installGemini() {
  const cfgPath = join(homedir(), ".gemini", "settings.json");
  const cfg = (await readJsonOrEmpty(cfgPath)) || {};
  cfg.hooks = cfg.hooks || {};
  // SessionStart is intentionally skipped (we don't ping on session boot).
  const events = ["AfterAgent", "Notification", "AfterTool"];
  let added = 0;
  for (const event of events) {
    cfg.hooks[event] = cfg.hooks[event] || [];
    const already = cfg.hooks[event].some(
      (h) => h.command && h.command.includes("blunders-blitz hook gemini")
    );
    if (already) continue;
    cfg.hooks[event].push({
      command: `blunders-blitz hook gemini ${event}`,
    });
    added++;
  }
  if (added) await writeJsonAtomic(cfgPath, cfg);
  return added ? `added ${added} hook(s)` : "already wired";
}

export async function installCopilot() {
  const root = await detectGitRoot();
  if (!root) {
    throw new Error(
      "not in a git repo (Copilot hooks are per-repo — re-run from the repo root)"
    );
  }
  const cfgPath = join(root, ".github", "hooks", "hooks.json");
  const cfg = (await readJsonOrEmpty(cfgPath)) || { version: 1, hooks: {} };
  cfg.version = cfg.version || 1;
  cfg.hooks = cfg.hooks || {};
  const events = [
    {
      name: "postToolUse",
      bash: "blunders-blitz hook copilot postToolUse",
    },
    {
      name: "errorOccurred",
      bash: "blunders-blitz hook copilot errorOccurred",
    },
  ];
  let added = 0;
  for (const e of events) {
    cfg.hooks[e.name] = cfg.hooks[e.name] || [];
    const already = cfg.hooks[e.name].some(
      (h) => h.bash && h.bash.includes("blunders-blitz hook copilot")
    );
    if (already) continue;
    cfg.hooks[e.name].push({ type: "command", bash: e.bash });
    added++;
  }
  if (added) await writeJsonAtomic(cfgPath, cfg);
  return added ? `added ${added} hook(s) → ${cfgPath}` : "already wired";
}

const HOSTS = [
  {
    id: "claude",
    label: "Claude Code",
    hint: "~/.claude/settings.json + SKILL.md",
    detect: () => existsAsync(join(homedir(), ".claude")),
    install: installClaude,
  },
  {
    id: "codex",
    label: "Codex CLI",
    hint: "~/.codex/config.toml",
    detect: () => existsAsync(join(homedir(), ".codex")),
    install: installCodex,
  },
  {
    id: "cursor",
    label: "Cursor",
    hint: "~/.cursor/hooks.json",
    detect: () => existsAsync(join(homedir(), ".cursor")),
    install: installCursor,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    hint: "~/.gemini/settings.json",
    detect: () => existsAsync(join(homedir(), ".gemini")),
    install: installGemini,
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    hint: "<repo>/.github/hooks/hooks.json (per-repo)",
    detect: async () => Boolean(await detectGitRoot()),
    install: installCopilot,
  },
];

async function cmdInstall() {
  let clack;
  let pc;
  try {
    clack = await import("@clack/prompts");
    pc = (await import("picocolors")).default;
  } catch {
    console.error(
      "✗ install requires @clack/prompts and picocolors (npm dependencies)."
    );
    console.error(
      "  These ship with @blunders/blitz. If you cloned the repo, run `npm install` first."
    );
    return 1;
  }

  clack.intro(pc.bold("Blunders Blitz — setup"));

  const detection = {};
  for (const host of HOSTS) detection[host.id] = await host.detect();
  const anyDetected = Object.values(detection).some(Boolean);

  const options = HOSTS.map((host) => ({
    value: host.id,
    label: host.label + (detection[host.id] ? "" : pc.dim(" (not detected)")),
    hint: host.hint,
  }));
  const initialValues = HOSTS.filter((h) => detection[h.id]).map((h) => h.id);

  if (!anyDetected) {
    clack.note(
      "Didn't detect any AI tool config dirs. You can still install for tools\nyou plan to set up later — just pick them below.",
      "Heads up"
    );
  }

  const picked = await clack.multiselect({
    message: "Wire blunders-blitz hooks into which tools?",
    options,
    initialValues,
    required: false,
  });
  if (clack.isCancel(picked)) {
    clack.cancel("Cancelled — no files changed.");
    return 0;
  }
  if (!picked.length) {
    clack.outro("Nothing selected — no files changed.");
    return 0;
  }

  for (const id of picked) {
    const host = HOSTS.find((h) => h.id === id);
    const s = clack.spinner();
    s.start(`Wiring ${host.label}…`);
    try {
      const result = await host.install();
      s.stop(`${pc.green("✓")} ${host.label}: ${result}`);
    } catch (err) {
      s.stop(`${pc.red("✗")} ${host.label}: ${err.message}`);
    }
  }

  clack.note(
    [
      "Restart any running tool (Claude Code, Cursor) so it picks up new hooks.",
      "Run `blunders-blitz start` to launch the chess companion.",
      "Re-run `blunders-blitz install` anytime to add tools or refresh SKILL.md.",
    ].join("\n"),
    "Next"
  );
  clack.outro("Done.");
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

function translateCursor(argv, stdin) {
  // Adapted from peon-ping (MIT): adapters/cursor.sh
  // Cursor's hooks.json fires a small fixed event name (stop,
  // beforeShellExecution, beforeMCPExecution, afterFileEdit,
  // beforeReadFile, …) as argv[0] with a JSON conversation payload on
  // stdin. beforeReadFile is dropped — it's far too chatty to be useful
  // as a "needs attention" signal.
  const raw = (argv[0] || "stop").toString();
  let event;
  switch (raw) {
    case "stop":
    case "afterFileEdit":
      event = "task.complete";
      break;
    case "beforeShellExecution":
    case "beforeMCPExecution":
      event = "input.required";
      break;
    case "beforeReadFile":
      return null;
    default:
      event = "task.complete";
  }
  const cwd =
    (stdin && stdin.workspace_roots && stdin.workspace_roots[0]) ||
    (stdin && stdin.cwd) ||
    undefined;
  return {
    event,
    source: "cursor",
    cwd,
    session_id: stdin && stdin.conversation_id,
  };
}

function translateGemini(argv, stdin) {
  // Adapted from peon-ping (MIT): adapters/gemini.sh
  // Gemini CLI fires hooks with a CamelCase event name as argv[0]
  // (SessionStart, AfterAgent, Notification, AfterTool, …) and a JSON
  // payload on stdin. AfterTool carries an exit_code; non-zero is the
  // only way Gemini surfaces "a tool just failed," so we promote it to
  // an error event with the captured stderr as the modal message.
  const raw = (argv[0] || "SessionStart").toString();
  let event;
  switch (raw) {
    case "SessionStart":
      event = "session.start";
      break;
    case "AfterAgent":
      event = "task.complete";
      break;
    case "Notification":
      event = "input.required";
      break;
    case "AfterTool": {
      const exit = stdin ? Number(stdin.exit_code || 0) : 0;
      event = exit !== 0 ? "error" : "task.complete";
      break;
    }
    default:
      return null;
  }
  return {
    event,
    source: "gemini",
    message:
      stdin && stdin.stderr ? String(stdin.stderr).slice(0, 180) : undefined,
    cwd: stdin && stdin.cwd,
    session_id: stdin && stdin.session_id,
  };
}

function translateCopilot(argv, stdin) {
  // Adapted from peon-ping (MIT): adapters/copilot.sh
  // GitHub Copilot's repo-level hooks.json fires events with camelCase
  // names. `postToolUse` is used here as the "task complete" signal,
  // matching peon-ping's choice — it's an approximation (it fires after
  // every tool, not just session end) but Copilot doesn't currently
  // expose a cleaner "agent done" event. Drop it from the hooks list
  // if it gets too chatty and keep only `errorOccurred`.
  const raw = (argv[0] || "sessionStart").toString();
  let event;
  switch (raw) {
    case "sessionStart":
      event = "session.start";
      break;
    case "postToolUse":
      event = "task.complete";
      break;
    case "errorOccurred":
      event = "error";
      break;
    case "sessionEnd":
    case "userPromptSubmitted":
    case "preToolUse":
    default:
      return null;
  }
  return {
    event,
    source: "copilot",
    cwd: stdin && stdin.cwd,
    session_id: stdin && stdin.sessionId,
  };
}

const TRANSLATORS = {
  claude: translateClaude,
  codex: translateCodex,
  cursor: translateCursor,
  gemini: translateGemini,
  copilot: translateCopilot,
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
  blunders-blitz install                            # interactive setup: pick tools, patch configs

Environment:
  BLUNDERS_BLITZ_PORT       default port for "start" (default 7878)
  BLUNDERS_BLITZ_STATE_DIR  override state directory (default ~/.blunders-blitz)

Typical usage from an assistant:
  blunders-blitz start                             # launch the game
  blunders-blitz alert "Need your input on Foo"    # ping when done
  blunders-blitz dismiss                           # clear when user replies

First-time setup:
  blunders-blitz install                           # walks you through wiring each AI tool
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
    case "install":
      return cmdInstall();
    case "install-skill":
      console.error(
        "✗ `install-skill` was removed in 0.7.0. Run `blunders-blitz install` instead —\n" +
          "  it covers Claude Code (SKILL.md + hooks) plus Codex / Cursor / Gemini / Copilot."
      );
      return 1;
    default:
      console.error(`✗ unknown command: ${cmd}\n`);
      printHelp();
      return 1;
  }
}

// Only run main when invoked as a CLI, not when imported as a module.
// realpath both sides so the npm bin symlink (and other wrappers like asdf
// shims) resolves to the same path as `import.meta.url`. Without this,
// invoking through any symlink produces no output at all.
function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  main().then(
    (code) => process.exit(code || 0),
    (err) => {
      console.error("✗", err.stack || err.message);
      process.exit(1);
    }
  );
}
