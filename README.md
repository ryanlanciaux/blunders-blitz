# Blunders Blitz

Play chess against Stockfish in your browser while your AI coding agent works
in the background. When the agent needs your input, it pings the chess tab so
you don't miss it.

Built as a skill for Claude Code — works with any agentic CLI that can shell
out (Codex, Cursor, generic shell-equipped LLMs).

## Install

No install needed — just use `npx`:

```bash
npx @blunders/blitz start
```

Or install globally for a shorter command:

```bash
npm install -g @blunders/blitz
blunders-blitz start
```

From source:

```bash
git clone https://github.com/ryanlanciaux/blunders-blitz.git
cd blunders-blitz
npm link                                 # global symlink
```

Requires Node 18+ (uses native `fetch`, `EventSource` via the browser, ESM).

## Use it manually

```bash
blunders-blitz start                 # opens http://127.0.0.1:7878
blunders-blitz alert "Done!"         # pops the modal on the chess tab
blunders-blitz dismiss               # clears the modal
blunders-blitz stop                  # shuts down the local server
blunders-blitz status                # is it running? any active alert?
```

Override the port: `blunders-blitz start --port 8765`.

## Use it with an AI assistant

One-step setup for every supported tool:

```bash
blunders-blitz install
```

That launches an interactive picker, detects which AI tools you have
installed (`~/.claude/`, `~/.codex/`, `~/.cursor/`, `~/.gemini/`, and any
git repo for Copilot's per-repo config), and patches each chosen tool's
hook config to ping the chess tab when the agent finishes or needs your
input. Idempotent (re-run safely), atomic, and leaves a `.bak` of any
file it modifies on first edit.

Currently supports **Claude Code**, **OpenAI Codex CLI**, **Cursor**,
**Gemini CLI**, and **GitHub Copilot**. Per-tool details and the exact
JSON/TOML the wizard writes are in [`skill/SKILL.md`](skill/SKILL.md) if
you'd rather wire it manually or inspect the diff first.

Then in your session:

> "I want to play chess while you implement the new auth flow."

The agent will run `blunders-blitz start`, work on the task, and the
hook will fire `blunders-blitz alert` when it's done. After you reply,
the agent runs `blunders-blitz dismiss` so the dialog disappears.

For agents without a hook system, just tell the tool: "When you need my
attention, run `blunders-blitz alert '<message>'`. When I respond, run
`blunders-blitz dismiss`."

## Deploying as a static site

The `public/` directory is a fully static site — drop it onto any static host.
The agent-ping channel naturally degrades to "static only" when there's no
local server backing `/events`.

### Cloudflare Pages

```bash
# from the project root
npx wrangler pages deploy public --project-name blunders-blitz
```

Then add a custom domain in the Pages dashboard pointing at this project.

### Netlify / Vercel

Both work the same way. Point the deploy at `public/` as the publish
directory, no build step. Example `netlify.toml`:

```toml
[build]
publish = "public"
```

### Nginx / Caddy / S3

Just serve `public/` as a static site. The `.wasm` MIME type is the only
catch — make sure your host serves `application/wasm` for `.wasm` files
(Cloudflare/Netlify/Vercel handle this automatically).

### A note on the alert channel in production

The `/events`, `/alert`, `/dismiss` endpoints only exist on the **local**
Node server. On a deployed subdomain they 404 silently and the UI shows
"static mode (no agent channel)". That's deliberate — the ping feature is
designed for local development where your AI assistant runs on the same
machine. If you want a hosted ping channel later, a tiny Cloudflare
Worker with Durable Object state could implement the same three endpoints.

## Project layout

```
blunders-blitz/
├── bin/
│   └── blunders-blitz.mjs       # CLI entry
├── server/
│   └── server.mjs               # zero-dep Node server
├── public/                       # everything below is the static site
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── blunders-logo.svg
│   ├── favicon.svg
│   ├── pieces/kosal/             # Kosal piece set (CC BY 4.0)
│   ├── stockfish/                # stockfish.js + stockfish.wasm (GPLv3)
│   ├── sounds/*.mp3
│   └── vendor/chess.js          # chess.js ESM build
├── skill/
│   └── SKILL.md                 # Claude Code / agent skill definition
├── LICENSE                      # MIT (this project's source)
└── package.json
```

## Credits

Visual design (logo, color palette, type) borrowed from
[blunders.ai](https://blunders.ai).

## Prior art

The multi-agent hook architecture (the adapter-shim pattern, the event-type
taxonomy distinguishing `task.complete` / `input.required` / `error`, and the
per-agent translation logic for Codex / Cursor / Gemini / Copilot) is
deliberately modeled on **[peon-ping](https://github.com/PeonPing/peon-ping)**
by Tony Sheng (MIT). Several translators in `bin/blunders-blitz.mjs` are
adapted from peon-ping's `adapters/*.sh` and carry per-function attribution
comments. Full notice and license text in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Licensing

This project's own source code (the CLI, server, HTML/CSS/JS in `public/`
excluding the vendored libraries) is **MIT** — see [`LICENSE`](LICENSE).

Vendored third-party assets keep their original licenses:

- **Stockfish** (`public/stockfish/`) — **GPLv3**. Full license text at
  [`public/stockfish/LICENSE-stockfish.txt`](public/stockfish/LICENSE-stockfish.txt);
  authors at [`public/stockfish/AUTHORS-stockfish.txt`](public/stockfish/AUTHORS-stockfish.txt);
  provenance and source pointer at
  [`public/stockfish/README.md`](public/stockfish/README.md). Stockfish runs as
  an unmodified WebAssembly worker — it is bundled as a separate program, not
  linked into this project's code. If you redistribute this project (e.g. fork
  it, host a copy, or republish to npm), you must preserve the Stockfish
  license, attribution files, and a way for recipients to obtain the
  corresponding Stockfish source.
- **Kosal pieces** (`public/pieces/kosal/`) — by Philatype, licensed under
  **CC BY 4.0**. Full license text at
  [`public/pieces/kosal/LICENSE-kosal.txt`](public/pieces/kosal/LICENSE-kosal.txt);
  attribution and source pointer at
  [`public/pieces/kosal/README.md`](public/pieces/kosal/README.md). Pieces are
  bundled unmodified from https://github.com/philatype/kosal.
- **chess.js** (`public/vendor/chess.js`) — BSD-2-Clause, see
  [`public/vendor/LICENSE-chess.js.txt`](public/vendor/LICENSE-chess.js.txt).
