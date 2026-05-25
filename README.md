# Blunders Blitz

Play chess against Stockfish in your browser while your AI coding agent works
in the background. When the agent needs your input, it pings the chess tab so
you don't miss it.

Built as a skill for Claude Code — works with any agentic CLI that can shell
out (Codex, Cursor, generic shell-equipped LLMs).

```
┌──────────────────────────────────────────┐
│   Browser tab                            │
│   ┌────────────┐  ┌──────────────────┐   │
│   │            │  │ Strength: 1400   │   │
│   │  chess     │  │ Status: Your move│   │
│   │  board     │  │ Moves: 1. e4 e5  │   │
│   │            │  │  ...              │   │
│   └────────────┘  └──────────────────┘   │
│                                          │
│   ┌─ "Needs your attention" ──────────┐  │
│   │  Claude finished the migration.   │  │
│   │            [ Got it ]             │  │
│   └───────────────────────────────────┘  │
└────────────▲─────────────────────────────┘
             │ SSE  ▲ POST /alert  ▲ POST /dismiss
             │      │              │
   ┌─────────┴──────┴──────────────┴────┐
   │  blunders-blitz (Node, zero-dep)   │
   │  serves /public, holds alert state │
   └────────────────────────────────────┘
             ▲
             │
   ┌─────────┴──────────┐
   │  CLI: blunders-blitz│ ← drives it from your terminal /
   │  start | alert | …  │   from your AI assistant's shell
   └─────────────────────┘
```

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

The skill at [`skill/SKILL.md`](skill/SKILL.md) is written for Claude Code but
the pattern works for any agentic CLI tool that can shell out.

**Claude Code** — one-step install of the skill:

```bash
blunders-blitz install-skill
```

That copies `SKILL.md` into `~/.claude/skills/blunders-blitz/`. (Pass
`--dir <path>` to install elsewhere, or `--force` to overwrite.)

Then in your session:

> "I want to play chess while you implement the new auth flow."

Claude will run `blunders-blitz start`, work on the task, then call
`blunders-blitz alert "..."` when it's done. After you reply, it'll
`blunders-blitz dismiss` so the dialog disappears.

**Other tools (Codex, Cursor, generic shell-equipped LLMs)** — the same CLI
verbs work. Tell your tool: "When you need my attention, run
`blunders-blitz alert '<message>'`. When I respond, run `blunders-blitz dismiss`."

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
