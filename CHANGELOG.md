# Changelog

All notable changes to Blunders Blitz. Versions before `0.6.0` were
internal-only — the public npm release jumps from `0.2.0` to `0.6.0`.

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
