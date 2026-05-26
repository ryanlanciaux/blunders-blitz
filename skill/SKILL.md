---
name: blunders-blitz
description: Launches a local Blunders-branded chess game (vs Stockfish) so the user can play while a long-running task runs. The same CLI sends "needs attention" pings back to the chess tab when the task finishes or hits a checkpoint. Use when the user says something like "play chess while you work", "start the chess game", "ping me when you're done", or when you're kicking off a long autonomous run and want to keep them entertained.
---

# Blunders Blitz — CLI skill

This skill drives `blunders-blitz`, a standalone HTML/JS chess game with the
Blunders look-and-feel. It runs on a small local Node server and exposes three
verbs the assistant can call: **start**, **alert**, **dismiss**.

## When to use

Invoke this skill when:

- The user says something like "I'm going to play chess while you work on X",
  "start the chess game", "fire up Blunders", or "ping me on the chess tab
  when you're done".
- You're about to begin a long-running task (>~2 minutes) and want to keep the
  user occupied AND get their attention again when it finishes.
- The user asks you to set up the local chess companion.

Do **not** invoke unprompted. Don't start the game just because a task is long;
wait for the user to ask, or offer it explicitly ("want to play chess while I
work on this?") and only start after they say yes.

## How it works

The CLI is a Node script — invoke it from Bash. There are no required env vars.

```bash
# 1. Launch the game (opens a browser tab to http://127.0.0.1:7878).
#    Idempotent: re-running just opens the existing tab.
blunders-blitz start

# 2. When the user needs to come back — send an alert to the chess tab.
#    The tab pops a Blunders-styled modal with whatever message you pass.
blunders-blitz alert "Finished refactoring the auth flow — ready for review" \
  --title "Done" --source "Claude"

# 2b. Same as `alert`, but a silent no-op (exit 0) if the server isn't
#     running. Use this from Claude Code Stop hooks so the hook is safe
#     to leave on globally — it only pings when the chess tab is up.
blunders-blitz alert-if-running "Claude is back to you" --source "Claude"

# 3. After the user replies in the terminal, clear the modal so it's gone
#    if they switch back to the chess tab.
blunders-blitz dismiss

# Utility
blunders-blitz status        # is it running? any active alert?
blunders-blitz stop          # shut down the local server
```

## Workflow

1. **Start of session** — if the user signals they want to play while waiting:
   - Run `blunders-blitz start`.
   - A browser tab opens with the game. The user picks an Elo from the
     dropdown and starts playing.
   - Confirm in chat: "Chess game running at http://127.0.0.1:7878 — go for it,
     I'll ping you when I'm done."

2. **Mid-task milestones (optional)** — for important checkpoints or when you
   need user input mid-task, fire an alert with a short, specific message:
   - `blunders-blitz alert "Need a decision: should the migration drop the old column or keep both?"`
   - Keep messages concise. Title is optional (defaults to "Needs your attention").

3. **Task complete — THIS STEP IS NON-OPTIONAL.** The whole point of starting
   the chess game is that the user has walked away from the terminal. If you
   finish the task without firing an alert, they will never know you're done.
   Always run this as the literal last action of the turn, before your final
   chat message:
   - `blunders-blitz alert "All tests pass on the new schema — back to you." --title "Done" --source "Claude"`

   If you started the chess game earlier in the session, you **must** alert at
   the end — even if the task ended up shorter than expected, even if you're
   just stopping to ask a question, even if you think they might still be at
   the keyboard. The cost of an unnecessary ping is ~zero; the cost of a
   missed ping is the user waiting indefinitely.

4. **When the user responds** — as soon as their next message comes in, clear
   the dialog so it doesn't linger:
   - `blunders-blitz dismiss`

## Guaranteed pings via hooks (recommended)

Skill instructions are guidance, not enforcement — an assistant can still
forget to call `alert` at the end of a long run. For belt-and-suspenders
reliability, wire `blunders-blitz hook <agent>` into your AI tool's hook
system so the tool itself fires the alert when its turn ends.

**Easiest path — `blunders-blitz install`.** Runs an interactive picker,
detects which AI tools you have, and patches each one's config file for
you. Idempotent (re-runs are safe), atomic, and leaves a `.bak` of any
file it modifies on first edit. Tell the user to run this once:

```
blunders-blitz install
```

That covers Claude Code (SKILL.md + Stop/Notification hooks), Codex CLI,
Cursor, Gemini CLI, and GitHub Copilot (per-repo, run from the repo
root).

### Manual setup (if you'd rather edit configs yourself)

The wizard writes exactly the snippets below. Use these if you want to
inspect the diff before applying or customize the wiring beyond what the
default wizard does.

`blunders-blitz hook <agent>` is a silent no-op when the chess server
isn't up, so any of these hooks are safe to leave on globally — they
only ping on sessions where the user actually started the game.

**Claude Code** — `~/.claude/settings.json`:

```jsonc
{
  "hooks": {
    "Stop":         [{"hooks":[{"type":"command","command":"blunders-blitz hook claude"}]}],
    "Notification": [{"hooks":[{"type":"command","command":"blunders-blitz hook claude"}]}]
  }
}
```

**Codex CLI** — `~/.codex/config.toml`:

```toml
notify = ["blunders-blitz", "hook", "codex"]
```

Codex passes the event name as the first argument (e.g.
`agent-turn-complete`, `permission-requested`) and an optional JSON
payload on stdin. The translator detects permission-style events
(including `notification_type = "permission_prompt"`) and routes them as
"Needs your input"; everything else is treated as "Back to you."

**Cursor** — `~/.cursor/hooks.json`:

```json
{
  "hooks": [
    { "event": "stop", "command": "blunders-blitz hook cursor stop" },
    { "event": "beforeShellExecution", "command": "blunders-blitz hook cursor beforeShellExecution" },
    { "event": "beforeMCPExecution", "command": "blunders-blitz hook cursor beforeMCPExecution" }
  ]
}
```

`stop` and `afterFileEdit` fire "Back to you"; `beforeShellExecution` and
`beforeMCPExecution` (which Cursor uses to ask for permission) fire
"Needs your input." `beforeReadFile` is intentionally dropped at the
translator — it's far too chatty.

**Gemini CLI** — `~/.gemini/settings.json`:

```json
{
  "hooks": {
    "AfterAgent":   [{ "command": "blunders-blitz hook gemini AfterAgent" }],
    "Notification": [{ "command": "blunders-blitz hook gemini Notification" }],
    "AfterTool":    [{ "command": "blunders-blitz hook gemini AfterTool" }]
  }
}
```

The translator recognises `SessionStart` (skipped — no ping on session
boot), `AfterAgent` (→ task.complete), `Notification` (→ input.required),
and `AfterTool` (→ task.complete on success, → error on non-zero
`exit_code`, with the captured `stderr` surfaced as the modal message).

**GitHub Copilot**

Add to your repo's `.github/hooks/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      { "type": "command", "bash": "blunders-blitz hook copilot postToolUse" }
    ],
    "errorOccurred": [
      { "type": "command", "bash": "blunders-blitz hook copilot errorOccurred" }
    ]
  }
}
```

Caveat — Copilot has no clean "agent done" hook the way Claude and Codex
do, so `postToolUse` is used as a proxy for completion. That means
you'll get a "Back to you" ping after each tool use, not only at the
end of the turn. If that's too chatty, drop the `postToolUse` block and
keep only `errorOccurred` — you'll still be alerted on failures, you
just won't get a green completion ping.

## Notes & gotchas

- **The CLI is a no-op outside the local machine.** It only works when the
  user has the game open in their browser. If they're on a deployed
  subdomain (e.g. game.blunders.ai), the alert verbs will fail with a
  connection error — that's expected; tell the user to run
  `blunders-blitz start` locally if they want the ping channel.
- **Don't spam alerts.** One alert per meaningful interruption. If you're
  about to send a second alert while the first is still active, just update
  the message — the server replaces the active alert.
- **Source label.** Pass `--source "Claude"` (or "Codex", "Cursor", etc.)
  so the dialog eyebrow matches whichever model the user is running.
- The game runs entirely client-side — no API keys, no network deps. The
  user can keep playing even after `blunders-blitz stop`; only the ping
  channel goes away.
