#!/usr/bin/env node
// blunders-blitz postinstall
//
// 1. Fetches the Stockfish WASM engine if it's not already on disk.
//    The binaries live outside git (see .gitignore + public/stockfish/README.md)
//    but are pinned by SHA256 to the official `stockfish@17.1.0` npm release.
// 2. Prints a "next step" hint pointing at `blunders-blitz install`.
//
// Deliberately does NOT run the interactive setup wizard. Running prompts
// during `npm install` breaks in CI, gets silently skipped by users who set
// `npm config set ignore-scripts true`, and is surprising. The hint nudges
// people toward `blunders-blitz install`, which is where the real wiring
// happens.

import { createHash } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const STOCKFISH_DIR = join(ROOT, "public", "stockfish");

// Pinned to stockfish@17.1.0's lite-single variant — the same files that were
// previously vendored. SHA256s computed from the official npm tarball
// (registry.npmjs.org/stockfish/-/stockfish-17.1.0.tgz).
const STOCKFISH_VERSION = "17.1.0";
const STOCKFISH_VARIANT = "stockfish-17.1-lite-single-03e3232";
const ASSETS = [
  {
    name: "stockfish.js",
    url: `https://unpkg.com/stockfish@${STOCKFISH_VERSION}/src/${STOCKFISH_VARIANT}.js`,
    sha256: "1c8265e52fdaef797684b4979b42c5dcfe0350df3e11a87e48e4ec5f86e0ca5c",
  },
  {
    name: "stockfish.wasm",
    url: `https://unpkg.com/stockfish@${STOCKFISH_VERSION}/src/${STOCKFISH_VARIANT}.wasm`,
    sha256: "7ca31bedd166148931a1cc84dbd8dd9cf001744e9994caf23a3c6ff4988d7086",
  },
];

async function fileSha256(path) {
  try {
    const buf = await readFile(path);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

async function ensureAsset({ name, url, sha256 }) {
  const dest = join(STOCKFISH_DIR, name);
  const existing = await fileSha256(dest);
  if (existing === sha256) return { name, status: "present" };

  await mkdir(STOCKFISH_DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== sha256) {
    throw new Error(
      `SHA256 mismatch for ${name}: got ${got}, expected ${sha256}`,
    );
  }

  const tmp = `${dest}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, dest);
  return { name, status: existing ? "replaced" : "downloaded" };
}

async function fetchStockfish() {
  const results = [];
  for (const asset of ASSETS) {
    results.push(await ensureAsset(asset));
  }
  const fetched = results.filter((r) => r.status !== "present");
  if (fetched.length === 0) return null;
  return `  ✓ Stockfish engine ready (${fetched.map((r) => r.name).join(", ")}).`;
}

async function main() {
  let stockfishLine = null;
  try {
    stockfishLine = await fetchStockfish();
  } catch (err) {
    // Never fail npm install — but make it loud enough for a human to notice.
    const msg = err && err.message ? err.message : String(err);
    console.error("");
    console.error("  ⚠  Could not download the Stockfish engine.");
    console.error(`     ${msg}`);
    console.error(
      `     Re-run \`npm rebuild @blunders/blitz\` (or \`npm install\` from`,
    );
    console.error(`     the project root) once you're back online.`);
    console.error("");
  }

  if (process.env.CI) return;

  const lines = [
    "",
    "  ✓ @blunders/blitz installed.",
    ...(stockfishLine ? [stockfishLine] : []),
    "",
    "    Next: run `blunders-blitz install` to wire it into your AI tools",
    "          (Claude Code, Codex, Cursor, Gemini, Copilot).",
    "          Then `blunders-blitz start` to launch the chess companion.",
    "",
  ];
  for (const line of lines) console.log(line);
}

main().catch(() => {
  // Belt-and-braces: never fail npm install for the sake of a hint.
});
