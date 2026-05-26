#!/usr/bin/env node
// blunders-blitz postinstall — prints a "next step" hint.
//
// Deliberately does NOT run the interactive setup wizard. Running prompts
// during `npm install` breaks in CI, gets silently skipped by users who set
// `npm config set ignore-scripts true`, and is surprising. The hint nudges
// people toward `blunders-blitz install`, which is where the real wiring
// happens.

try {
  // Skip in CI and other non-interactive automation.
  if (process.env.CI) process.exit(0);

  const lines = [
    "",
    "  ✓ @blunders/blitz installed.",
    "",
    "    Next: run `blunders-blitz install` to wire it into your AI tools",
    "          (Claude Code, Codex, Cursor, Gemini, Copilot).",
    "          Then `blunders-blitz start` to launch the chess companion.",
    "",
  ];
  for (const line of lines) console.log(line);
} catch {
  // Never fail npm install for the sake of a hint.
}
