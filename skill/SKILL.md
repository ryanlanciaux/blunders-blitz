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

3. **Task complete** — always alert when the work is done so the user can come
   back from the chess tab:
   - `blunders-blitz alert "All tests pass on the new schema — back to you." --title "Done"`

4. **When the user responds** — as soon as their next message comes in, clear
   the dialog so it doesn't linger:
   - `blunders-blitz dismiss`

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
