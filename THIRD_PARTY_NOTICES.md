# Third-Party Notices

This file collects attribution for third-party work that **inspired or was
adapted into** Blunders Blitz's source code, separate from the vendored
runtime assets covered in `LICENSE` and the README's "Licensing" section
(Stockfish, Kosal pieces, chess.js).

---

## peon-ping

**Repo:** https://github.com/PeonPing/peon-ping
**License:** MIT
**Copyright:** © 2025 Tony Sheng
**Adapted in:** `bin/blunders-blitz.mjs` (multi-agent hook adapter
architecture and per-agent event translation logic)

Blunders Blitz's multi-agent hook system is modeled on peon-ping. The
following are direct intellectual debts:

- The **adapter shim pattern** — each AI agent (Codex, Cursor, Gemini,
  Copilot, …) has its own native hook event schema; a thin translator per
  agent normalizes those payloads into a single internal event shape that
  the rest of the system reasons about.
- The **CESP-style event taxonomy** — distinguishing `task.complete`,
  `input.required`, `error`, `session.start` rather than firing one
  undifferentiated "ping." Blunders Blitz scopes this down for a chess UI
  but the carve-out comes from peon-ping.
- The **per-agent translation logic** for Codex, Cursor, Gemini, and
  Copilot — payload shapes, event-name mappings, and skip rules for noisy
  events (e.g. `beforeReadFile`, `preToolUse`) are adapted from
  peon-ping's `adapters/*.sh`. Where a translator in
  `bin/blunders-blitz.mjs` is structurally close to an upstream `.sh`
  adapter, the JS function carries an `// Adapted from peon-ping (MIT):
  adapters/<agent>.sh` comment.

MIT does not require attribution for borrowing patterns (only for
redistributing source), but the borrowing is substantial enough that we
include peon-ping's full license text below as a matter of respect.

### peon-ping's MIT License

```
MIT License

Copyright (c) 2025 Tony Sheng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
