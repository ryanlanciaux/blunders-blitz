# Stockfish — vendored, GPLv3

The files in this directory are part of the **Stockfish** chess engine,
distributed under the **GNU General Public License version 3 (GPLv3)**. They
are bundled with Blunders Blitz unmodified and run in the browser as a
separate WebAssembly worker. Blunders Blitz's own code (MIT licensed) does
not link against Stockfish source — it communicates with the engine via the
standard UCI message protocol over `postMessage`.

## What's here

| File | Purpose |
| --- | --- |
| `stockfish.js`   | Worker loader / JS shim around the WebAssembly module. |
| `stockfish.wasm` | The compiled Stockfish engine. |
| `LICENSE-stockfish.txt` | Full GPLv3 license text. |
| `AUTHORS-stockfish.txt` | List of Stockfish contributors. |

## Version & source

The bundled build is **Stockfish.js 17.1** (the JS/WASM port maintained by
Nathan Rugg). The corresponding source code — required to satisfy GPLv3's
source-availability obligation — is publicly available at:

- **Stockfish.js port (the WASM build):** https://github.com/nmrugg/stockfish.js
- **Upstream Stockfish engine:** https://github.com/official-stockfish/Stockfish

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
