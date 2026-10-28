// MODULE 07 — CIRCUIT (Current & Conduit)
// 4x4 Grid: Rotate brass pipe tiles to carry warm magnetic current from the dynamo
// to every reading lantern — without letting any current leak out of an open pipe end.
//
// Design notes
//  - Pipes are drawn as real brass conduits (end caps, straights, elbows, tees, crosses).
//  - Current visibly flows through powered pipes; open ends spill sparks where they leak.
//  - A few pipes are bolted in place, giving each puzzle fixed anchor points.

import { createRNG } from "./rng.js";
import { sound } from "./audio.js";
import { ico } from "./icons.js";

const GRID_SIZE = 4;

// Direction bitmasks: Up = 1, Right = 2, Down = 4, Left = 8
const UP = 1;
const RIGHT = 2;
const DOWN = 4;
const LEFT = 8;
const DIRS = [UP, RIGHT, DOWN, LEFT];

const OPPOSITE = { [UP]: DOWN, [RIGHT]: LEFT, [DOWN]: UP, [LEFT]: RIGHT };
const DELTAS = {
  [UP]: { dr: -1, dc: 0 },
  [RIGHT]: { dr: 0, dc: 1 },
  [DOWN]: { dr: 1, dc: 0 },
  [LEFT]: { dr: 0, dc: -1 },
};

// Port end points inside a 100x100 tile
const PORT_END = {
  [UP]: { x: 50, y: 0 },
  [RIGHT]: { x: 100, y: 50 },
  [DOWN]: { x: 50, y: 100 },
  [LEFT]: { x: 0, y: 50 },
};

const popcount = (m) =>
  (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

export class CircuitGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = "";
    this.grid = [];
    this.source = { r: 0, c: 0 };
    this.terminals = [];
    this.poweredTilesCount = 0;

    this.moves = 0;
    this.hintsUsed = 0;
    this.startTime = 0;
    this.solved = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.hintHighlightTile = null;
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = Date.now();
    this.hintHighlightTile = null;
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;

    this.generatePuzzle(seedStr);
    this.propagatePower(true);
    this.render();
  }

  rotateMask(mask, steps = 1) {
    let m = mask;
    for (let i = 0; i < steps % 4; i++) {
      m = ((m << 1) & 0b1111) | ((m >> 3) & 1);
    }
    return m;
  }

  // ------------------------------------------------------------------ generation

  generatePuzzle(seedStr) {
    const rng = createRNG(`CIRCUIT_V2_${seedStr}`);

    const visited = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(false),
    );
    const connections = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(0),
    );

    const corners = [
      { r: 0, c: 0 },
      { r: 0, c: 3 },
      { r: 3, c: 0 },
      { r: 3, c: 3 },
    ];
    const sourcePos = rng.pick(corners);
    this.source = sourcePos;

    const stack = [sourcePos];
    visited[sourcePos.r][sourcePos.c] = true;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const neighbors = [];
      DIRS.forEach((dir) => {
        const { dr, dc } = DELTAS[dir];
        const nr = current.r + dr;
        const nc = current.c + dc;
        if (
          nr >= 0 &&
          nr < GRID_SIZE &&
          nc >= 0 &&
          nc < GRID_SIZE &&
          !visited[nr][nc]
        ) {
          neighbors.push({ dir, nr, nc });
        }
      });

      if (neighbors.length > 0) {
        const next = rng.pick(neighbors);
        connections[current.r][current.c] |= next.dir;
        connections[next.nr][next.nc] |= OPPOSITE[next.dir];
        visited[next.nr][next.nc] = true;
        stack.push({ r: next.nr, c: next.nc });
      } else {
        stack.pop();
      }
    }

    // Extra loops: open a few extra walls so the network is not a pure tree (richer routing)
    const extra = rng.int(1, 2);
    for (let k = 0; k < extra; k++) {
      const r = rng.int(0, GRID_SIZE - 1);
      const c = rng.int(0, GRID_SIZE - 1);
      const dir = rng.pick([RIGHT, DOWN]);
      const { dr, dc } = DELTAS[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < GRID_SIZE && nc < GRID_SIZE && (connections[r][c] & dir) === 0) {
        connections[r][c] |= dir;
        connections[nr][nc] |= OPPOSITE[dir];
      }
    }

    // Distances from source (BFS)
    const distances = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(-1),
    );
    const q = [{ r: sourcePos.r, c: sourcePos.c, d: 0 }];
    distances[sourcePos.r][sourcePos.c] = 0;
    while (q.length > 0) {
      const { r, c, d } = q.shift();
      DIRS.forEach((dir) => {
        if ((connections[r][c] & dir) !== 0) {
          const { dr, dc } = DELTAS[dir];
          const nr = r + dr;
          const nc = c + dc;
          if (distances[nr][nc] === -1) {
            distances[nr][nc] = d + 1;
            q.push({ r: nr, c: nc, d: d + 1 });
          }
        }
      });
    }

    // Lanterns: prefer leaves, then the farthest tiles
    const candidates = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (r === sourcePos.r && c === sourcePos.c) continue;
        candidates.push({
          r,
          c,
          degree: popcount(connections[r][c]),
          dist: distances[r][c],
        });
      }
    }
    candidates.sort((a, b) => {
      if (a.degree === 1 && b.degree !== 1) return -1;
      if (a.degree !== 1 && b.degree === 1) return 1;
      return b.dist - a.dist;
    });

    const numTerminals = rng.int(3, 4);
    this.terminals = candidates
      .slice(0, numTerminals)
      .map(({ r, c }) => ({ r, c }));

    // Bolted-in-place pipes: elbows / tees that are neither source nor lantern
    const lockPool = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const m = connections[r][c];
        const isSource = r === sourcePos.r && c === sourcePos.c;
        const isTerminal = this.terminals.some((t) => t.r === r && t.c === c);
        const straight = m === (UP | DOWN) || m === (LEFT | RIGHT);
        if (
          !isSource &&
          !isTerminal &&
          popcount(m) >= 2 &&
          popcount(m) < 4 &&
          !straight
        )
          lockPool.push({ r, c });
      }
    }
    const lockedSet = new Set(
      rng
        .shuffle([...lockPool])
        .slice(0, 2)
        .map((p) => `${p.r},${p.c}`),
    );

    this.grid = Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) => {
        const baseMask = connections[r][c];
        const isSource = r === sourcePos.r && c === sourcePos.c;
        const isTerminal = this.terminals.some((t) => t.r === r && t.c === c);
        const locked = lockedSet.has(`${r},${c}`);

        let rotSteps = 0;
        if (!isSource && !locked) rotSteps = rng.int(1, 3);

        return {
          r,
          c,
          baseMask,
          currentMask: this.rotateMask(baseMask, rotSteps),
          rotDeg: rotSteps * 90, // cumulative visual rotation (never wraps, so animation never spins backwards)
          isSource,
          isTerminal,
          locked,
          powered: isSource,
          leakMask: 0,
        };
      }),
    );
  }

  // ------------------------------------------------------------------ power flow

  propagatePower(silent = false) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        this.grid[r][c].powered = false;
        this.grid[r][c].leakMask = 0;
      }
    }

    const queue = [{ r: this.source.r, c: this.source.c }];
    this.grid[this.source.r][this.source.c].powered = true;
    let poweredCount = 1;

    while (queue.length > 0) {
      const { r, c } = queue.shift();
      const tile = this.grid[r][c];

      DIRS.forEach((dir) => {
        if ((tile.currentMask & dir) === 0) return;
        const { dr, dc } = DELTAS[dir];
        const nr = r + dr;
        const nc = c + dc;

        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) {
          tile.leakMask |= dir;
          return;
        }

        const neighbor = this.grid[nr][nc];
        if ((neighbor.currentMask & OPPOSITE[dir]) !== 0) {
          if (!neighbor.powered) {
            neighbor.powered = true;
            poweredCount++;
            queue.push({ r: nr, c: nc });
          }
        } else {
          tile.leakMask |= dir;
        }
      });
    }

    const previousCount = this.poweredTilesCount;
    this.poweredTilesCount = poweredCount;

    const flat = this.grid.flat();
    const allTerminalsPowered = this.terminals.every(
      (t) => this.grid[t.r][t.c].powered,
    );
    const noLeaksInCircuit = !flat.some((t) => t.powered && t.leakMask !== 0);

    if (allTerminalsPowered && noLeaksInCircuit && !this.solved && !silent) {
      this.handleWin();
    }

    return {
      allTerminalsPowered,
      noLeaksInCircuit,
      previousCount,
      currentCount: poweredCount,
    };
  }

  // ------------------------------------------------------------------ interaction

  handleTileClick(r, c) {
    if (this.solved) return;
    const tile = this.grid[r][c];

    if (tile.locked || tile.isSource) {
      sound.playClick(220, 0.05);
      const el = this.tileEl(r, c);
      if (el) {
        el.classList.remove("cx-shake");
        void el.offsetWidth;
        el.classList.add("cx-shake");
      }
      return;
    }

    sound.playRelayClick();
    this.moves++;

    tile.rotDeg += 90;
    tile.currentMask = this.rotateMask(tile.currentMask, 1);
    this.hintHighlightTile = null;

    const res = this.propagatePower();
    if (res.currentCount > res.previousCount)
      sound.playVoltageChirp(res.currentCount);

    this.update();
  }

  handleWin() {
    this.solved = true;
    sound.playCircuitHum();
    setTimeout(() => sound.playVictory(), 320);
    // update() is called by the caller afterwards; make sure the UI reflects the win either way
    setTimeout(() => this.update(), 0);

    if (this.onWin) setTimeout(() => this.onWin(this.getShareSummary()), 1000);
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // Prefer a wrong tile that is next to the live current, so the hint feels like "follow the pipe"
    const wrongTiles = this.grid
      .flat()
      .filter((t) => !t.isSource && !t.locked && t.currentMask !== t.baseMask);
    wrongTiles.sort((a, b) => {
      const da = Math.abs(a.r - this.source.r) + Math.abs(a.c - this.source.c);
      const db = Math.abs(b.r - this.source.r) + Math.abs(b.c - this.source.c);
      return da - db;
    });
    const wrongTile = wrongTiles[0];

    if (wrongTile) {
      let steps = 0;
      let testMask = wrongTile.currentMask;
      while (testMask !== wrongTile.baseMask && steps < 4) {
        testMask = this.rotateMask(testMask, 1);
        steps++;
      }

      wrongTile.rotDeg += steps * 90;
      wrongTile.currentMask = wrongTile.baseMask;
      this.hintHighlightTile = { r: wrongTile.r, c: wrongTile.c };

      sound.playRelayClick();
      const res = this.propagatePower();
      if (res.currentCount > res.previousCount)
        sound.playVoltageChirp(res.currentCount);
    } else {
      sound.playClick(600);
    }

    this.update();
    this.armHintCooldown();
  }

  resetPuzzle() {
    if (this.solved) return;
    sound.playClick(320);
    this.loadSeed(this.seed);
  }

  destroy() {
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
  }

  getShareSummary() {
    const elapsedSec = Math.max(
      1,
      Math.round((Date.now() - this.startTime) / 1000),
    );
    const visualCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = this.grid[r][c];
        if (t.isSource) visualCells.push("pivot");
        else if (t.isTerminal) visualCells.push("active");
        else visualCells.push(t.powered ? "blue" : "empty");
      }
    }

    const S = 100;
    const pipes = [];
    const nodes = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = this.grid[r][c];
        const cx = c * S + 50;
        const cy = r * S + 50;
        nodes.push(
          `<rect x="${c * S + 6}" y="${r * S + 6}" width="${S - 12}" height="${S - 12}" rx="14" fill="rgba(255,244,230,0.04)" stroke="rgba(255,236,214,0.08)" />`,
        );
        DIRS.forEach((dir) => {
          if ((t.currentMask & dir) === 0) return;
          const p = PORT_END[dir];
          pipes.push(
            `<line x1="${cx}" y1="${cy}" x2="${c * S + p.x}" y2="${r * S + p.y}" />`,
          );
        });
        if (t.isSource)
          nodes.push(`<circle cx="${cx}" cy="${cy}" r="17" fill="#ffd978" stroke="#fff2b8" stroke-width="3" />`);
        else if (t.isTerminal)
          nodes.push(`<circle cx="${cx}" cy="${cy}" r="14" fill="#fff6e4" stroke="#ffaa33" stroke-width="4" />`);
      }
    }
    const visualSvg = `<svg viewBox="0 0 ${GRID_SIZE * S} ${GRID_SIZE * S}" xmlns="http://www.w3.org/2000/svg">${nodes.filter((s) => s.startsWith("<rect")).join("")}<g stroke="#ffcf7a" stroke-width="12" stroke-linecap="round" opacity="0.9">${pipes.join("")}</g>${nodes.filter((s) => !s.startsWith("<rect")).join("")}</svg>`;

    const n = this.terminals.length;
    return {
      gameName: "CIRCUIT",
      subtitle: `${n}/${n} lanterns lit, no leaks`,
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: "time",
      stat1Value: `${elapsedSec}s`,
      stat2Label: "turns",
      stat2Value: `${this.moves}`,
      stat3Label: "lanterns",
      stat3Value: `${n}/${n}`,
      gridCols: 4,
      visualCells,
      visualSvg,
      metricText: `${this.moves} turns • ${elapsedSec}s`,
      shareText: `focal • circuit (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} turns\n◆ all ${n} lanterns lit, no leaks`,
    };
  }

  // ------------------------------------------------------------------ rendering

  tileEl(r, c) {
    return this.container.querySelector(
      `.circuit-tile[data-r="${r}"][data-c="${c}"]`,
    );
  }

  // Pipe drawn in its solution (base) orientation; the wrapper rotates it with CSS
  pipeSvg(tile) {
    const ports = DIRS.filter((d) => (tile.baseMask & d) !== 0);
    const seg = (d) => `M50 50 L${PORT_END[d].x} ${PORT_END[d].y}`;
    const dAll = ports.map(seg).join(" ");

    const flanges = ports
      .map((d) => {
        const horizontal = d === LEFT || d === RIGHT;
        const x = d === LEFT ? 0 : d === RIGHT ? 92 : 33;
        const y = d === UP ? 0 : d === DOWN ? 92 : 33;
        return horizontal
          ? `<rect x="${x}" y="${y}" width="8" height="34" rx="2" class="cx-flange" />`
          : `<rect x="${x}" y="${y}" width="34" height="8" rx="2" class="cx-flange" />`;
      })
      .join("");

    const degree = ports.length;
    const hub =
      degree === 1
        ? `<circle cx="50" cy="50" r="17" class="cx-cap-shadow" /><circle cx="50" cy="50" r="14" class="cx-cap" />`
        : `<circle cx="50" cy="50" r="${degree >= 3 ? 17 : 14}" class="cx-joint" />`;

    return `
      <svg class="circuit-tile-svg" viewBox="0 0 100 100">
        <path d="${dAll}" class="cx-pipe-shadow" />
        <path d="${dAll}" class="cx-pipe-brass" />
        <path d="${dAll}" class="cx-pipe-shine" />
        <path d="${dAll}" class="cx-pipe-current" />
        ${flanges}
        ${hub}
      </svg>`;
  }

  // Static (non-rotating) overlay: dynamo, lantern, leak sparks, bolts
  overlaySvg(tile) {
    let out = "";

    if (tile.locked) {
      out += [
        [10, 10],
        [90, 10],
        [10, 90],
        [90, 90],
      ]
        .map(
          ([x, y]) =>
            `<circle cx="${x}" cy="${y}" r="3.4" class="cx-rivet" /><line x1="${x - 2}" y1="${y}" x2="${x + 2}" y2="${y}" class="cx-rivet-slot" />`,
        )
        .join("");
    }

    if (tile.isSource) {
      out += `
        <circle cx="50" cy="50" r="29" class="cx-dynamo-pulse" />
        <circle cx="50" cy="50" r="23" class="cx-dynamo-body" />
        <path d="M30 50 a20 20 0 0 1 40 0" class="cx-dynamo-coil" />
        <path d="M30 50 a20 20 0 0 0 40 0" class="cx-dynamo-coil cx-coil-b" />
        <path d="M53 34 L43 52 H50 L47 66 L58 47 H51 Z" class="cx-dynamo-bolt" />`;
    }

    if (tile.isTerminal) {
      const lit = tile.powered;
      out += `
        ${lit ? '<circle cx="50" cy="50" r="30" class="cx-lantern-aura" />' : ""}
        <path d="M39 33 L50 25 L61 33 Z" class="cx-lantern-cap" />
        <rect x="37" y="33" width="26" height="34" rx="6" class="cx-lantern-glass ${lit ? "lit" : ""}" />
        <path d="M50 62 C42 56 46 48 50 41 C54 48 58 56 50 62 Z" class="cx-lantern-flame ${lit ? "lit" : ""}" />
        <rect x="35" y="66" width="30" height="6" rx="2" class="cx-lantern-base" />
        <line x1="37" y1="45" x2="63" y2="45" class="cx-lantern-bar" /><line x1="37" y1="56" x2="63" y2="56" class="cx-lantern-bar" />`;
    }

    if (tile.powered) {
      DIRS.forEach((d) => {
        if ((tile.leakMask & d) === 0) return;
        const p = PORT_END[d];
        const x = Math.max(6, Math.min(94, p.x));
        const y = Math.max(6, Math.min(94, p.y));
        out += `
          <circle cx="${x}" cy="${y}" r="6" class="cx-leak-spark" />
          <circle cx="${x}" cy="${y}" r="3" class="cx-leak-core" />`;
      });
    }

    return `<svg class="circuit-tile-overlay" viewBox="0 0 100 100">${out}</svg>`;
  }

  tileClasses(tile, isHint) {
    return [
      "circuit-tile",
      tile.powered ? "is-powered" : "",
      tile.isSource ? "is-source" : "",
      tile.isTerminal ? "is-terminal" : "",
      tile.locked ? "is-locked" : "",
      tile.leakMask && tile.powered ? "has-leak" : "",
      isHint ? "cell-hint-glow" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  hudHtml() {
    const total = this.terminals.length;
    const lit = this.terminals.filter(
      (t) => this.grid[t.r][t.c].powered,
    ).length;
    return `
      <div class="hud-card">
        <span class="hud-label">lanterns lit</span>
        <div class="hud-value ${lit === total ? "ok" : ""}">
          ${lit} / ${total} <span style="font-size:12px;opacity:0.7;">lanterns</span>
        </div>
      </div>
      <div class="hud-card" style="text-align: center;">
        <span class="hud-label">the current</span>
        <div class="status-pill ${this.solved ? "solved" : this.leaking() ? "error" : ""}">${this.statusText(lit, total)}</div>
      </div>
      <div class="hud-card" style="text-align: right;">
        <span class="hud-label">pipe turns</span>
        <div class="hud-value">${this.moves} <span style="font-size:12px;opacity:0.7;">turns</span></div>
      </div>`;
  }

  leaking() {
    return this.grid.flat().some((t) => t.powered && t.leakMask !== 0);
  }

  statusText(lit, total) {
    if (this.solved) return `${ico("check")} Every lantern glows`;
    if (lit === total) return "Current is escaping";
    if (this.poweredTilesCount <= 1) return "The pipes are cold";
    return "The current searches";
  }

  render() {
    const isCooldown =
      this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown
      ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000)
      : 0;

    let tilesHtml = "";
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const tile = this.grid[r][c];
        const title = tile.isSource
          ? "The dynamo: warm current starts here"
          : tile.locked
            ? "Bolted pipe: it cannot be turned"
            : tile.isTerminal
              ? "Reading lantern: bring current here"
              : "Brass pipe: tap to turn";
        tilesHtml += `
          <div class="${this.tileClasses(tile, false)}" data-r="${r}" data-c="${c}" title="${title}">
            <div class="circuit-tile-body">
              <div class="cx-rotor" style="transform: rotate(${tile.rotDeg}deg)">${this.pipeSvg(tile)}</div>
              <div class="cx-overlay">${this.overlaySvg(tile)}</div>
            </div>
            ${tile.locked || tile.isSource ? "" : `<span class="circuit-tile-rot-hint">${ico("rotate")}</span>`}
          </div>`;
      }
    }

    this.container.innerHTML = `
      <div class="game-panel circuit-panel ${this.solved ? "is-solved" : ""}">
        <div class="circuit-hud" id="cx-hud">${this.hudHtml()}</div>

        <div class="circuit-stage-wrapper">
          <div class="circuit-board">${tilesHtml}</div>
        </div>

        <div class="action-btns" style="justify-content: space-between; align-items: center; margin-top: 4px;">
          <button id="circuit-reset-btn" class="btn-secondary" title="Return every pipe to its starting position">${ico("reset")}<span>start fresh</span></button>

          <div class="px-legend">
            <span><i class="px-lg cx-lg-pipe"></i>turn</span>
            <span><i class="px-lg px-lg-fixed"></i>bolted</span>
            <span><i class="px-lg cx-lg-spark"></i>leak</span>
          </div>

          <button id="circuit-hint-btn" class="btn-secondary btn-hint ${isCooldown ? "cooldown-active" : ""}"
                  style="--cooldown-dur: ${remSec}s" ${isCooldown ? "disabled" : ""}>
            <span class="btn-text">hint (${this.hintsUsed})</span>
            <span class="btn-cooldown-wipe"></span>
          </button>
        </div>
      </div>
    `;

    this.container.querySelectorAll(".circuit-tile").forEach((el) => {
      el.addEventListener("click", () => {
        this.handleTileClick(
          parseInt(el.dataset.r, 10),
          parseInt(el.dataset.c, 10),
        );
      });
    });

    this.container
      .querySelector("#circuit-hint-btn")
      ?.addEventListener("click", () => this.giveHint());
    this.container
      .querySelector("#circuit-reset-btn")
      ?.addEventListener("click", () => this.resetPuzzle());

    this.armHintCooldown();
  }

  armHintCooldown() {
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
    const btn = this.container.querySelector("#circuit-hint-btn");
    if (!btn) return;
    btn.querySelector(".btn-text").textContent = `hint (${this.hintsUsed})`;
    const remaining = this.hintCooldownUntil - Date.now();
    if (remaining > 0) {
      btn.classList.add("cooldown-active");
      btn.setAttribute("disabled", "");
      btn.style.setProperty("--cooldown-dur", `${remaining / 1000}s`);
      this.hintCooldownTimer = setTimeout(() => {
        btn.classList.remove("cooldown-active");
        btn.removeAttribute("disabled");
      }, remaining);
    }
  }

  // In-place refresh so pipes rotate smoothly instead of snapping
  update() {
    const root = this.container.querySelector(".circuit-panel");
    if (!root) return;
    root.classList.toggle("is-solved", this.solved);

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const tile = this.grid[r][c];
        const el = this.tileEl(r, c);
        if (!el) continue;
        const isHint =
          this.hintHighlightTile &&
          this.hintHighlightTile.r === r &&
          this.hintHighlightTile.c === c;
        el.className = this.tileClasses(tile, isHint);
        const rotor = el.querySelector(".cx-rotor");
        if (rotor) rotor.style.transform = `rotate(${tile.rotDeg}deg)`;
        const overlay = el.querySelector(".cx-overlay");
        if (overlay) overlay.innerHTML = this.overlaySvg(tile);
      }
    }

    const hud = root.querySelector("#cx-hud");
    if (hud) hud.innerHTML = this.hudHtml();
  }
}
