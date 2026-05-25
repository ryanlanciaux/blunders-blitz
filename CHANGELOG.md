# Changelog

All notable changes to Blunders Blitz. Versions `0.3.0`–`0.5.0` exist as
git commits but were not published to npm — the public release line
jumps from `0.2.0` to `0.6.0` once the full multi-agent surface
landed in a single coherent shape.

## 0.6.0 — Multi-agent hook support

This release rolls up the internal `0.3.0`–`0.5.0` work into one public
npm release: a normalized event pipeline plus per-agent translators for
Claude Code, OpenAI Codex CLI, Cursor, Gemini CLI, and GitHub Copilot.

### Added
- **Normalized event pipeline.** New `blunders-blitz handle-event`
  subcommand is the single internal entry point for hook-driven pings.
  Accepts JSON on stdin: `{event, source, message?, title?, …}`.
  Event types: `task.complete` (green "Back to you"), `input.required`
  (amber "Needs your input"), `error` (red "Ran into an error"), and
  `session.start` (no-op).
- **`blunders-blitz hook <agent>`** — per-agent translator subcommand.
  Reads each agent's native hook payload (argv tail + stdin JSON) and
  emits a normalized event. Wired for: `claude`, `codex`, `cursor`,
  `gemini`, `copilot`. The wiring is silent-no-op when the chess
  server is not running, so it's safe to leave on globally.
- **`THIRD_PARTY_NOTICES.md`** — full attribution for peon-ping (MIT)
  including the upstream license text.
- README "Prior art" section crediting peon-ping for the multi-agent
  hook pattern.
- SKILL.md "Wiring other agents" section with per-agent setup snippets:
  - Claude Code: `Stop` + `Notification` hooks in `~/.claude/settings.json`
  - Codex CLI: `notify = ["blunders-blitz","hook","codex"]` in `~/.codex/config.toml`
  - Cursor: hooks block in `~/.cursor/hooks.json`
  - Gemini CLI: per-event hook wiring
  - GitHub Copilot: `.github/hooks/hooks.json` block

### Changed
- SKILL.md's recommended Claude Code Stop hook now uses
  `blunders-blitz hook claude` instead of the v0.2.0
  `alert-if-running` direct call. The new command handles both Stop
  and Notification hook events from the same wiring (it reads
  `hook_event_name` from stdin to pick the modal style).
- The "always alert at completion" guidance in SKILL.md is now backed
  by harness-enforced hooks for each supported agent, not just soft
  instructions to the assistant.

### Attribution
The multi-agent architecture (adapter-shim pattern, CESP-style event
taxonomy, and the per-agent translation logic for Codex / Cursor /
Gemini / Copilot) is modeled on
**[peon-ping](https://github.com/PeonPing/peon-ping)** by Tony Sheng,
MIT-licensed. Per-translator credit comments are inline in
`bin/blunders-blitz.mjs`; full notice is in `THIRD_PARTY_NOTICES.md`.

---

The sections below cover the git-only intermediate releases.

## 0.5.0 — Internal (not published)

### Added
- `blunders-blitz hook cursor` — translator for Cursor IDE's hook events
  (`stop`, `afterFileEdit`, `beforeShellExecution`, `beforeMCPExecution`,
  …). Adapted from peon-ping's `adapters/cursor.sh`. `beforeReadFile` is
  dropped to avoid noise.
- `blunders-blitz hook gemini` — translator for Gemini CLI's hook events
  (`SessionStart`, `AfterAgent`, `Notification`, `AfterTool`). On
  `AfterTool` with non-zero `exit_code`, surfaces the captured `stderr`
  as the modal message. Adapted from peon-ping's `adapters/gemini.sh`.
- SKILL.md "Wiring other agents" sections for Cursor (`~/.cursor/hooks.json`
  snippet) and Gemini CLI.

## 0.5.x → 0.6.0 — Final adapter (Copilot) folded into the public release

Copilot's hook adapter (added on the path to 0.6.0):

- `blunders-blitz hook copilot` — translator for GitHub Copilot hook
  events (`sessionStart`, `postToolUse`, `errorOccurred`, …). Adapted
  from peon-ping's `adapters/copilot.sh`. `postToolUse` is used as the
  "task complete" proxy since Copilot has no clean "agent done" hook;
  the SKILL.md docs explain the trade-off and how to drop it if too
  chatty.

## 0.4.0 — Internal (not published)

### Added
- `blunders-blitz hook codex` — translates OpenAI Codex CLI's notify
  payload (event-name argv + optional JSON stdin) into the normalized
  event pipeline. Distinguishes permission/approval prompts from
  agent-turn-complete from error events. Translation logic adapted from
  peon-ping's `adapters/codex.sh`.
- SKILL.md "Wiring other agents → Codex CLI" section with the
  `~/.codex/config.toml` snippet.

## 0.3.0 — Internal (not published)

### Added
- `blunders-blitz handle-event` — normalized JSON-stdin dispatcher; the
  single internal entry point for hook-driven pings. Accepts events of
  type `task.complete`, `input.required`, `error`, or `session.start`
  (the last is intentionally a no-op).
- `blunders-blitz hook claude` — translator subcommand for Claude Code's
  Stop and Notification hook payloads. Distinguishes "task complete"
  from "input required" automatically based on `hook_event_name`.
- `THIRD_PARTY_NOTICES.md` — attribution for peon-ping (MIT), whose
  multi-agent adapter pattern this release is modeled on.

### Changed
- `SKILL.md` — Claude Code Stop hook recipe migrated from
  `alert-if-running` to `hook claude`. Added a Notification hook recipe
  for permission-prompt pings.
- `README.md` — added "Prior art" section crediting peon-ping.
