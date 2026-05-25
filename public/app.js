import { Chess } from "/vendor/chess.js";

// ── elements ────────────────────────────────────────────────
const boardEl = document.getElementById("board");
const movesEl = document.getElementById("moves");
const statusEl = document.getElementById("status");
const engineNameEl = document.getElementById("engine-name");
const playerNameEl = document.getElementById("player-name");
const pickerOverlayEl = document.getElementById("picker-overlay");
const pickerCards = document.querySelectorAll(".picker-card");
const gameoverOverlayEl = document.getElementById("gameover-overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayNewBtn = document.getElementById("overlay-new");
const eloSelect = document.getElementById("elo");
const newGameBtn = document.getElementById("new-game");

const dialogEl = document.getElementById("attention-dialog");
const dialogTitleEl = document.getElementById("attention-title");
const dialogMessageEl = document.getElementById("attention-message");
const dialogSourceEl = document.getElementById("attention-source");
const dialogDismissBtn = document.getElementById("dialog-dismiss");

const connStatusEl = document.getElementById("conn-status");
const connTextEl = document.getElementById("conn-text");

// ── assets ──────────────────────────────────────────────────
const PIECE_SVG = {
  wK: "/pieces/kosal/white_king.svg",
  wQ: "/pieces/kosal/white_queen.svg",
  wR: "/pieces/kosal/white_rook.svg",
  wB: "/pieces/kosal/white_bishop.svg",
  wN: "/pieces/kosal/white_knight.svg",
  wP: "/pieces/kosal/white_pawn.svg",
  bK: "/pieces/kosal/black_king.svg",
  bQ: "/pieces/kosal/black_queen.svg",
  bR: "/pieces/kosal/black_rook.svg",
  bB: "/pieces/kosal/black_bishop.svg",
  bN: "/pieces/kosal/black_knight.svg",
  bP: "/pieces/kosal/black_pawn.svg",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// ── state ───────────────────────────────────────────────────
const game = new Chess();
let orientation = "white";
let selected = null;
let legalTargets = [];
let lastMove = null;
let engineThinking = false;
let gameOver = false;
let currentElo = parseInt(eloSelect.value, 10);

// ── audio (optional, soft) ──────────────────────────────────
const moveSound = (() => {
  try {
    const a = new Audio("/sounds/move1.mp3");
    a.volume = 0.35;
    return a;
  } catch {
    return null;
  }
})();
const captureSound = (() => {
  try {
    const a = new Audio("/sounds/move2.mp3");
    a.volume = 0.4;
    return a;
  } catch {
    return null;
  }
})();
function playSound(s) {
  if (!s) return;
  try {
    s.currentTime = 0;
    s.play().catch(() => {});
  } catch {}
}

// ── board rendering ─────────────────────────────────────────
function renderBoard() {
  const board = game.board(); // 8x8 from rank 8 down to rank 1
  const orientedRanks = orientation === "white" ? RANKS : [...RANKS].reverse();
  const orientedFiles = orientation === "white" ? FILES : [...FILES].reverse();

  boardEl.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const file = orientedFiles[f];
      const rank = orientedRanks[r];
      const square = file + rank;
      const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;

      const sqEl = document.createElement("div");
      sqEl.className = "square " + (isLight ? "light" : "dark");
      sqEl.dataset.square = square;

      // file/rank coords on the edges
      if (r === 7) {
        const fileLabel = document.createElement("span");
        fileLabel.className = "coord file";
        fileLabel.textContent = file;
        sqEl.appendChild(fileLabel);
      }
      if (f === 0) {
        const rankLabel = document.createElement("span");
        rankLabel.className = "coord rank";
        rankLabel.textContent = rank;
        sqEl.appendChild(rankLabel);
      }

      // piece — board() returns rank 8 first, so use literal index
      const piece = board[RANKS.indexOf(rank)][FILES.indexOf(file)];
      if (piece) {
        const pEl = document.createElement("div");
        pEl.className = "piece";
        const key = (piece.color === "w" ? "w" : "b") + piece.type.toUpperCase();
        pEl.style.backgroundImage = `url('${PIECE_SVG[key]}')`;
        sqEl.appendChild(pEl);
        sqEl.classList.add("has-piece");
      }

      // last move highlight
      if (lastMove && (square === lastMove.from || square === lastMove.to)) {
        sqEl.classList.add("last-move");
      }
      // selection highlight
      if (selected === square) {
        sqEl.classList.add("selected");
      }
      // legal target dot
      if (legalTargets.includes(square)) {
        const dot = document.createElement("div");
        dot.className = "legal-dot";
        sqEl.appendChild(dot);
      }
      // king in check
      if (game.inCheck()) {
        const turn = game.turn();
        if (piece && piece.type === "k" && piece.color === turn) {
          sqEl.classList.add("in-check");
        }
      }

      sqEl.addEventListener("click", () => onSquareClick(square));

      boardEl.appendChild(sqEl);
    }
  }
}

function onSquareClick(square) {
  if (gameOver || engineThinking) return;
  const turn = game.turn();
  const humanColor = orientation === "white" ? "w" : "b";
  if (turn !== humanColor) return;

  const piece = game.get(square);

  // toggle deselect
  if (selected === square) {
    selected = null;
    legalTargets = [];
    renderBoard();
    return;
  }

  // attempt move if a piece is selected and target is legal
  if (selected && legalTargets.includes(square)) {
    tryMove(selected, square);
    return;
  }

  // select own piece
  if (piece && piece.color === turn) {
    selected = square;
    legalTargets = game
      .moves({ square, verbose: true })
      .map((m) => m.to);
    renderBoard();
    return;
  }

  selected = null;
  legalTargets = [];
  renderBoard();
}

function tryMove(from, to) {
  // auto-promote to queen (could surface a chooser later)
  const moving = game.get(from);
  const promotion =
    moving && moving.type === "p" && (to.endsWith("8") || to.endsWith("1"))
      ? "q"
      : undefined;
  let move;
  try {
    move = game.move({ from, to, promotion });
  } catch {
    move = null;
  }
  if (!move) {
    selected = null;
    legalTargets = [];
    renderBoard();
    return;
  }
  lastMove = move;
  selected = null;
  legalTargets = [];
  playSound(move.captured ? captureSound : moveSound);
  updateMoves();
  renderBoard();
  updateStatus();
  if (checkGameOver()) return;

  // hand off to engine
  setTimeout(askEngine, 220);
}

// ── move list ───────────────────────────────────────────────
function updateMoves() {
  movesEl.innerHTML = "";
  const hist = game.history({ verbose: true });
  let row = 0;
  for (let i = 0; i < hist.length; i += 2) {
    row++;
    const numEl = document.createElement("li");
    numEl.className = "num";
    numEl.textContent = row + ".";
    const whiteEl = document.createElement("li");
    whiteEl.className = "ply" + (i === hist.length - 1 ? " current" : "");
    whiteEl.textContent = hist[i].san;
    const blackEl = document.createElement("li");
    blackEl.className = "ply" + (i + 1 === hist.length - 1 ? " current" : "");
    blackEl.textContent = hist[i + 1] ? hist[i + 1].san : "";
    movesEl.appendChild(numEl);
    movesEl.appendChild(whiteEl);
    movesEl.appendChild(blackEl);
  }
  movesEl.scrollTop = movesEl.scrollHeight;
}

function updateStatus() {
  const turn = game.turn();
  const humanColor = orientation === "white" ? "w" : "b";
  if (game.isCheckmate()) {
    statusEl.textContent = turn === humanColor ? "Checkmate — you lost" : "Checkmate — you won!";
  } else if (game.isStalemate()) {
    statusEl.textContent = "Stalemate";
  } else if (game.isInsufficientMaterial()) {
    statusEl.textContent = "Draw — insufficient material";
  } else if (game.isThreefoldRepetition()) {
    statusEl.textContent = "Draw — threefold";
  } else if (game.isDraw()) {
    statusEl.textContent = "Draw";
  } else if (engineThinking) {
    statusEl.textContent = "Stockfish thinking…";
  } else if (turn === humanColor) {
    statusEl.textContent = game.inCheck() ? "Check — your move" : "Your move";
  } else {
    statusEl.textContent = "Engine to move";
  }
}

function checkGameOver() {
  if (game.isGameOver()) {
    gameOver = true;
    let title = "Game Over";
    if (game.isCheckmate()) {
      const winner = game.turn() === "w" ? "Black" : "White";
      const humanColor = orientation === "white" ? "w" : "b";
      title = game.turn() === humanColor ? `Checkmate — ${winner} wins` : "Checkmate — You win!";
    } else if (game.isStalemate()) title = "Stalemate";
    else if (game.isDraw()) title = "Draw";
    overlayTitleEl.textContent = title;
    gameoverOverlayEl.hidden = false;
    return true;
  }
  return false;
}

// ── engine (stockfish via Web Worker) ───────────────────────
let engine;
let engineReady = false;
let pendingGo = false;

function initEngine() {
  try {
    engine = new Worker("/stockfish/stockfish.js");
    engine.addEventListener("message", onEngineMessage);
    engine.postMessage("uci");
  } catch (err) {
    console.error("Failed to start Stockfish worker", err);
    statusEl.textContent = "Engine unavailable";
  }
}

function onEngineMessage(e) {
  const line = typeof e.data === "string" ? e.data : "";
  if (!line) return;
  if (line === "uciok") {
    configureEngine();
  } else if (line === "readyok") {
    engineReady = true;
    if (pendingGo) {
      pendingGo = false;
      askEngine();
    }
  } else if (line.startsWith("bestmove")) {
    const parts = line.split(/\s+/);
    const mv = parts[1];
    handleEngineMove(mv);
  }
}

function configureEngine() {
  // Strength shaping
  const elo = currentElo;
  engineNameEl.textContent = `Stockfish ${elo}`;
  if (elo >= 3000) {
    engine.postMessage("setoption name UCI_LimitStrength value false");
  } else {
    const clamped = Math.max(1320, Math.min(3190, elo));
    engine.postMessage("setoption name UCI_LimitStrength value true");
    engine.postMessage(`setoption name UCI_Elo value ${clamped}`);
  }
  engine.postMessage("setoption name Threads value 1");
  engine.postMessage("setoption name Hash value 16");
  engine.postMessage("isready");
}

function pickMovetime(elo) {
  // weaker engine → quicker reply; stronger → think a bit
  if (elo <= 1000) return 200;
  if (elo <= 1400) return 350;
  if (elo <= 1800) return 600;
  if (elo <= 2200) return 900;
  return 1200;
}

function askEngine() {
  if (gameOver) return;
  if (!engine) return;
  if (!engineReady) {
    pendingGo = true;
    return;
  }
  engineThinking = true;
  updateStatus();
  engine.postMessage("position fen " + game.fen());
  engine.postMessage(`go movetime ${pickMovetime(currentElo)}`);
}

function handleEngineMove(uci) {
  if (!uci || uci === "(none)" || uci === "0000") {
    engineThinking = false;
    updateStatus();
    return;
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length > 4 ? uci.slice(4, 5) : undefined;
  let mv;
  try {
    mv = game.move({ from, to, promotion: promo });
  } catch {
    mv = null;
  }
  if (mv) {
    lastMove = mv;
    playSound(mv.captured ? captureSound : moveSound);
  }
  engineThinking = false;
  updateMoves();
  renderBoard();
  updateStatus();
  checkGameOver();
}

// ── new game / flip ─────────────────────────────────────────
function flashStatus() {
  statusEl.classList.remove("flash");
  // force reflow so the animation restarts on repeat clicks
  void statusEl.offsetWidth;
  statusEl.classList.add("flash");
}

function openPicker() {
  gameoverOverlayEl.hidden = true;
  pickerOverlayEl.hidden = false;
}

function startGame(color) {
  orientation = color === "black" ? "black" : "white";
  pickerOverlayEl.hidden = true;
  gameoverOverlayEl.hidden = true;
  game.reset();
  selected = null;
  legalTargets = [];
  lastMove = null;
  engineThinking = false;
  gameOver = false;
  playerNameEl.textContent = orientation === "white" ? "White" : "Black";
  renderBoard();
  updateMoves();
  statusEl.textContent =
    orientation === "white"
      ? "New game — your move (white)"
      : "New game — engine plays white";
  flashStatus();
  if (!engine) {
    initEngine();
  } else {
    engine.postMessage("ucinewgame");
    configureEngine();
  }
  const humanColor = orientation === "white" ? "w" : "b";
  if (game.turn() !== humanColor) {
    setTimeout(askEngine, 350);
  }
}

eloSelect.addEventListener("change", () => {
  currentElo = parseInt(eloSelect.value, 10);
  if (engine && engineReady) configureEngine();
});

pickerCards.forEach((card) => {
  card.addEventListener("click", () => startGame(card.dataset.color));
});
newGameBtn.addEventListener("click", openPicker);
overlayNewBtn.addEventListener("click", openPicker);

// ── LLM attention alert channel ─────────────────────────────
let evtSource = null;
let alertQueue = [];
let currentAlertId = null;

function setConnState(state, text) {
  connStatusEl.dataset.state = state;
  connTextEl.textContent = text;
}

function connectAlerts() {
  // If we're served from blunders-blitz start, /events is available.
  // On a deployed static site this just fails silently and we hide the channel.
  try {
    evtSource = new EventSource("/events");
  } catch {
    setConnState("local-only", "Static mode (no LLM channel)");
    return;
  }
  evtSource.onopen = () => {
    setConnState("connected", "Connected — waiting for assistant pings");
  };
  evtSource.addEventListener("alert", (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      showAlert(payload);
    } catch {}
  });
  evtSource.addEventListener("dismiss", () => {
    hideAlert();
  });
  evtSource.addEventListener("snapshot", (ev) => {
    // initial state from server (if there's an active alert when we connected)
    try {
      const payload = JSON.parse(ev.data);
      if (payload && payload.active) {
        showAlert(payload.active);
      }
    } catch {}
  });
  evtSource.onerror = () => {
    // Could be the user closed the CLI; degrade to static-only.
    setConnState("disconnected", "Disconnected from local server");
  };
}

function showAlert(payload) {
  currentAlertId = payload.id || null;
  dialogSourceEl.textContent = payload.source || "Claude";
  dialogTitleEl.textContent = payload.title || "Needs your attention";
  dialogMessageEl.textContent =
    payload.message || "Your assistant is waiting on you.";
  dialogEl.hidden = false;
  // gentle nudge on the tab title
  document.title = "● " + (payload.title || "Assistant ready") + " — Blunders";
  // soft sound
  playSound(captureSound);
}

function hideAlert() {
  dialogEl.hidden = true;
  document.title = "Blunders — Local Game";
  currentAlertId = null;
}

dialogDismissBtn.addEventListener("click", async () => {
  hideAlert();
  // Tell the server so a CLI `status` call sees it cleared.
  try {
    await fetch("/dismiss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "ui" }),
    });
  } catch {}
});

// Allow Esc to dismiss
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dialogEl.hidden) {
    dialogDismissBtn.click();
  }
});

// ── boot ────────────────────────────────────────────────────
renderBoard();
initEngine();
connectAlerts();
// Picker is visible on first load; user clicks a color to start.
statusEl.textContent = "Choose a side to start";
