# Stockfish — fetched at install time, GPLv3

The Stockfish chess engine runs in the browser as a separate WebAssembly
worker. The two runtime files live in this directory:

| File | Source of truth |
| --- | --- |
| `stockfish.js`   | Worker loader / JS shim around the WebAssembly module. |
| `stockfish.wasm` | The compiled Stockfish engine (~7 MB). |

Both are **not committed to git**. They're downloaded on `npm install` by
[`bin/postinstall.mjs`](../../bin/postinstall.mjs) from
`https://unpkg.com/stockfish@17.1.0/src/stockfish-17.1-lite-single-03e3232.{js,wasm}`
— the official `stockfish` package on npm, by Nathan Rugg / Chess.com — and
verified against pinned SHA256 hashes before being written to disk. The
published npm tarball for `@blunders/blitz` ships the binaries too, so an
`npm install -g @blunders/blitz` doesn't need to hit the network for them.

The license metadata files (this `README.md`, `LICENSE-stockfish.txt`,
`AUTHORS-stockfish.txt`) **are** committed — they need to travel with the
binaries wherever they're distributed.

## Version & source

The pinned build is **Stockfish.js 17.1** (the JS/WASM port maintained by
Nathan Rugg). The corresponding source code — required to satisfy GPLv3's
source-availability obligation — is publicly available at:

- **Stockfish.js port (the WASM build):** https://github.com/nmrugg/stockfish.js
- **Upstream Stockfish engine:** https://github.com/official-stockfish/Stockfish
- **npm release used for the fetch:** https://www.npmjs.com/package/stockfish/v/17.1.0

If you are redistributing this project (forking, mirroring, republishing to
npm, hosting a copy, etc.), you must:

1. Preserve `LICENSE-stockfish.txt`, `AUTHORS-stockfish.txt`, and this
   `README.md` alongside the binaries.
2. Continue to make the corresponding Stockfish source code available to
   downstream recipients — keeping these upstream links intact satisfies that
   requirement for an unmodified build.
3. Not strip the `Copyright (c) … Chess.com, LLC … License: GPLv3` banner at
   the top of `stockfish.js`.

## Why this is OK alongside MIT-licensed Blunders Blitz code

Stockfish is invoked as a separate process (a Web Worker running independent
WebAssembly code), with all communication going through UCI text messages.
This is "mere aggregation" under GPLv3 §5 — the GPL terms apply to Stockfish
itself but do not propagate to the surrounding application code. See the FSF's
guidance on "aggregate" works:
https://www.gnu.org/licenses/gpl-faq.html#MereAggregation.

If you modify Stockfish (rebuild the wasm with patches, change `stockfish.js`,
etc.), the modified version must also be distributed under GPLv3 and you must
provide the modified source to downstream recipients.
