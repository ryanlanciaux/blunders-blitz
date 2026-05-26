# Changelog

All notable changes to Blunders Blitz. Versions `0.3.0`–`0.5.0` exist as
git commits but were not published to npm — the public release line
jumps from `0.2.0` to `0.6.0` once the full multi-agent surface
landed in a single coherent shape.

## 0.7.2 — Stockfish out of git, fetched at install

### Changed
- **Stockfish binaries are no longer committed to the repo.** The 7 MB
  `stockfish.wasm` and its JS loader shim now live outside git
  (`.gitignore`d) and are downloaded by `bin/postinstall.mjs` from a
  pinned `unpkg.com/stockfish@17.1.0` URL. SHA256 is verified against
  hardcoded hashes before the files are written (bit-for-bit identical
  to what was previously vendored — the official `lite-single` build
  by nmrugg / Chess.com). The fetch is atomic, idempotent (skipped
  when files are already correct), and never fails `npm install` on
  network errors — it prints a recovery hint instead.
- **License & attribution files stay committed.** `LICENSE-stockfish.txt`,
  `AUTHORS-stockfish.txt`, and `public/stockfish/README.md` remain in
  git so the GPLv3 obligations (license, authorship, pointer to
  Corresponding Source) travel with the source distribution. The npm
  tarball still bundles the binaries via the `files:` whitelist, so
  `npm install -g @blunders/blitz` does not gain a network dependency
  — only fresh `git clone` contributors trigger the fetch.
- **README cleanup.** Dropped the ASCII architecture diagram from the
  top of the README; docs now lead with the install section.

## 0.7.1 — Symlink-safe main entry

### Fixed
- **Silent CLI when installed globally.** 0.7.0 added an `isMain` guard
  so the bin file could be imported without executing `main()`, but the
  guard compared `process.argv[1]` against `import.meta.url` literally.
  When npm installs the package globally it creates a symlink in the
  global bin dir; the symlink path and the resolved mjs path didn't
  match, so `main()` never ran and every command (including `--help`)
  produced no output. Now `realpath`s both sides before comparing, so
  npm global symlinks, asdf shims, and chained wrappers all resolve to
  the same canonical path. Reproduced and verified end-to-end.

## 0.7.0 — Interactive install wizard

The multi-agent hooks added in 0.6.0 only solved half the problem —
users still had to hand-edit each AI tool's config file to wire them
in. 0.7.0 closes that loop with a TUI installer.

### Added
- **`blunders-blitz install`** — interactive setup wizard (clack
  multiselect). Detects which AI tools you have installed
  (`~/.claude/`, `~/.codex/`, `~/.cursor/`, `~/.gemini/`, and any git
  repo for Copilot), pre-selects detected tools, and patches each
  chosen tool's config file with the right hook entries. Writes are
  atomic (tempfile + rename) and idempotent (re-running detects
  existing entries and skips). Leaves a `.bak` of any file it modifies
  on first edit. Refuses to overwrite an existing top-level
  `notify = …` line in `~/.codex/config.toml` (you keep your config).
- **`postinstall` script** — prints a one-line "next step" hint after
  `npm install -g @blunders/blitz` pointing at `blunders-blitz install`.
  Deliberately does NOT run the wizard during postinstall (CI breakage,
  surprising prompts, `ignore-scripts` users would miss it).

### Changed
- README "Use it with an AI assistant" section now leads with a single
  `blunders-blitz install` command.
- SKILL.md restructured: "Easiest path" (`install`) first, manual
  JSON/TOML snippets second for users who want to inspect or
  customize the wiring.
- The bin file is now safe to `import` from other Node modules — it
  only runs `main()` when invoked directly. Per-host installer
  functions (`installClaude`, `installCodex`, …) are now exported.

### Removed (breaking)
- **`blunders-blitz install-skill`** — fully removed. Its functionality
  (copying SKILL.md into `~/.claude/skills/`) is folded into the new
  `install` wizard's Claude Code step. Anyone hitting the old verb
  gets a clear error message pointing at `install`.

### Dependencies
- Adds `@clack/prompts` and `picocolors` as direct runtime dependencies
  (transitive: `@clack/core`, `sisteransi`). Tarball grows by ~50 kB;
  total deps remain modest. The "zero deps" boast no longer holds.

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
