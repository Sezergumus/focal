// MODÜL 07 — CIRCUIT (Magnetic Flux & Closed Circuit Laboratory)
// 4x4 Grid: Rotate flux tiles to connect power from the generator to all terminals.

import { createRNG } from './rng.js';
import { sound } from './audio.js';

const GRID_SIZE = 4;

// Direction bitmasks: Up = 1 (0b0001), Right = 2 (0b0010), Down = 4 (0b0100), Left = 8 (0b1000)
const UP = 1;
const RIGHT = 2;
const DOWN = 4;
const LEFT = 8;

const OPPOSITE = {
  [UP]: DOWN,
  [RIGHT]: LEFT,
  [DOWN]: UP,
  [LEFT]: RIGHT
};

const DELTAS = {
  [UP]: { dr: -1, dc: 0 },
  [RIGHT]: { dr: 0, dc: 1 },
  [DOWN]: { dr: 1, dc: 0 },
  [LEFT]: { dr: 0, dc: -1 }
};

export class CircuitGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = '';
    this.grid = []; // 4x4 array of tile objects
    this.source = { r: 0, c: 0 };
    this.terminals = []; // array of { r, c }
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
    this.propagatePower();
    this.render();
  }

  rotateMask(mask, steps = 1) {
    let m = mask;
    for (let i = 0; i < (steps % 4); i++) {
      // Up (1) -> Right (2) -> Down (4) -> Left (8) -> Up (1)
      m = ((m << 1) & 0b1111) | ((m >> 3) & 1);
    }
    return m;
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`CIRCUIT_V1_${seedStr}`);

    // Generate spanning tree on 4x4 grid via randomized DFS
    const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    const connections = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

    // Choose source (e.g. top-left or random corner)
    const corners = [{ r: 0, c: 0 }, { r: 0, c: 3 }, { r: 3, c: 0 }, { r: 3, c: 3 }];
    const sourcePos = rng.pick(corners);
    this.source = sourcePos;

    const stack = [sourcePos];
    visited[sourcePos.r][sourcePos.c] = true;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const neighbors = [];

      // Check all 4 adjacent directions
      [
        { dir: UP, dr: -1, dc: 0 },
        { dir: RIGHT, dr: 0, dc: 1 },
        { dir: DOWN, dr: 1, dc: 0 },
        { dir: LEFT, dr: 0, dc: -1 }
      ].forEach(({ dir, dr, dc }) => {
        const nr = current.r + dr;
        const nc = current.c + dc;
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && !visited[nr][nc]) {
          neighbors.push({ dir, nr, nc });
        }
      });

      if (neighbors.length > 0) {
        const next = rng.pick(neighbors);
        // Connect current and next
        connections[current.r][current.c] |= next.dir;
        connections[next.nr][next.nc] |= OPPOSITE[next.dir];
        visited[next.nr][next.nc] = true;
        stack.push({ r: next.nr, c: next.nc });
      } else {
        stack.pop();
      }
    }

    // Compute tree distance from sourcePos to all other cells
    const distances = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
    const distQueue = [{ r: sourcePos.r, c: sourcePos.c, d: 0 }];
    distances[sourcePos.r][sourcePos.c] = 0;

    while (distQueue.length > 0) {
      const { r, c, d } = distQueue.shift();
      const mask = connections[r][c];
      [UP, RIGHT, DOWN, LEFT].forEach(dir => {
        if ((mask & dir) !== 0) {
          const { dr, dc } = DELTAS[dir];
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && distances[nr][nc] === -1) {
            distances[nr][nc] = d + 1;
            distQueue.push({ r: nr, c: nc, d: d + 1 });
          }
        }
      });
    }

    // Collect candidate terminals: prioritize leaves first, then farthest cells from source
    const candidates = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (r === sourcePos.r && c === sourcePos.c) continue;
        const mask = connections[r][c];
        const degree = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
        candidates.push({ r, c, degree, dist: distances[r][c] });
      }
    }

    // Sort: leaves (degree === 1) first, ordered by distance descending, then other nodes by distance descending
    candidates.sort((a, b) => {
      if (a.degree === 1 && b.degree !== 1) return -1;
      if (a.degree !== 1 && b.degree === 1) return 1;
      return b.dist - a.dist;
    });

    const numTerminals = rng.int(3, 4);
    this.terminals = candidates.slice(0, numTerminals).map(({ r, c }) => ({ r, c }));

    // Build grid of tiles and scramble rotations
    this.grid = Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) => {
        const baseMask = connections[r][c];
        const isSource = r === sourcePos.r && c === sourcePos.c;
        const isTerminal = this.terminals.some(t => t.r === r && t.c === c);

        // Scramble non-source tiles
        let rotSteps = 0;
        if (!isSource) {
          rotSteps = rng.int(1, 3); // rotate 90, 180, or 270 deg
        }

        const currentMask = this.rotateMask(baseMask, rotSteps);

        return {
          r,
          c,
          baseMask, // solution mask
          currentMask, // active rotated mask
          rotDeg: rotSteps * 90,
          solutionRotDeg: 0,
          isSource,
          isTerminal,
          powered: isSource,
          hasLeak: false
        };
      })
    );
  }

  propagatePower() {
    // 1. Reset powered state
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        this.grid[r][c].powered = false;
        this.grid[r][c].hasLeak = false;
      }
    }

    // 2. BFS from source
    const queue = [{ r: this.source.r, c: this.source.c }];
    this.grid[this.source.r][this.source.c].powered = true;
    let poweredCount = 1;

    while (queue.length > 0) {
      const { r, c } = queue.shift();
      const currentTile = this.grid[r][c];

      // Check all 4 ports of currentTile
      [UP, RIGHT, DOWN, LEFT].forEach(dir => {
        if ((currentTile.currentMask & dir) !== 0) {
          const { dr, dc } = DELTAS[dir];
          const nr = r + dr;
          const nc = c + dc;

          // Out of bounds -> leak!
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) {
            currentTile.hasLeak = true;
            return;
          }

          const neighbor = this.grid[nr][nc];
          const oppDir = OPPOSITE[dir];

          // Check if neighbor connects back
          if ((neighbor.currentMask & oppDir) !== 0) {
            if (!neighbor.powered) {
              neighbor.powered = true;
              poweredCount++;
              queue.push({ r: nr, c: nc });
            }
          } else {
            // Unmatched port pointing into neighbor with no opening -> open leak!
            currentTile.hasLeak = true;
          }
        }
      });
    }

    const previousCount = this.poweredTilesCount;
    this.poweredTilesCount = poweredCount;

    // Check win condition:
    // All terminals are powered AND no powered tile has a leak!
    const allTerminalsPowered = this.terminals.every(t => this.grid[t.r][t.c].powered);
    const noLeaksInCircuit = !this.grid.some(row => row.some(tile => tile.powered && tile.hasLeak));

    if (allTerminalsPowered && noLeaksInCircuit && !this.solved) {
      this.handleWin();
    }

    return { allTerminalsPowered, noLeaksInCircuit, previousCount, currentCount: poweredCount };
  }

  handleTileClick(r, c) {
    if (this.solved) return;
    const tile = this.grid[r][c];

    sound.playRelayClick();
    this.moves++;

    // Rotate 90° clockwise
    tile.rotDeg += 90;
    tile.currentMask = this.rotateMask(tile.currentMask, 1);
    this.hintHighlightTile = null;

    const res = this.propagatePower();

    if (res.currentCount > res.previousCount) {
      sound.playVoltageChirp(res.currentCount);
    }

    this.render();
  }

  handleWin() {
    this.solved = true;
    sound.playCircuitHum();
    setTimeout(() => sound.playVictory(), 320);

    this.render();

    if (this.onWin) {
      setTimeout(() => this.onWin(this.getShareSummary()), 520);
    }
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // Find a tile that is not in its solution orientation
    const wrongTile = this.grid.flat().find(t => (t.currentMask !== t.baseMask) && !t.isSource);

    if (wrongTile) {
      // Find how many 90 deg steps are needed to reach baseMask
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
      if (res.currentCount > res.previousCount) {
        sound.playVoltageChirp(res.currentCount);
      }
    } else {
      sound.playClick(600);
    }

    this.render();
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
    const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const visualCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = this.grid[r][c];
        if (t.isSource) visualCells.push({ type: 'pivot', label: '◉' });
        else if (t.isTerminal) visualCells.push({ type: 'emerald', label: '◆' });
        else visualCells.push({ type: 'blue', label: '┼' });
      }
    }

    return {
      gameName: 'CIRCUIT',
      subtitle: `${this.terminals.length}/${this.terminals.length} terminals energized • 0 leaks`,
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: 'time',
      stat1Value: `${elapsedSec}s`,
      stat2Label: 'moves',
      stat2Value: `${this.moves}`,
      stat3Label: 'flux grid',
      stat3Value: '100%',
      gridCols: 4,
      visualCells,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • circuit (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n⚡ electromagnetic circuit locked`
    };
  }

  render() {
    const isCooldown = this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000) : 0;

    const poweredTerminals = this.terminals.filter(t => this.grid[t.r][t.c].powered).length;

    let tilesHtml = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const tile = this.grid[r][c];
        const isHint = this.hintHighlightTile && this.hintHighlightTile.r === r && this.hintHighlightTile.c === c;

        // Draw circuit traces inside SVG (viewBox 0 0 40 40)
        // Center is (20, 20)
        const hasUp = (tile.currentMask & UP) !== 0;
        const hasRight = (tile.currentMask & RIGHT) !== 0;
        const hasDown = (tile.currentMask & DOWN) !== 0;
        const hasLeft = (tile.currentMask & LEFT) !== 0;

        let traceSvg = `
          <svg class="circuit-tile-svg" viewBox="0 0 40 40">
            <!-- Center hub -->
            <circle cx="20" cy="20" r="3.5" class="circuit-wire-hub ${tile.powered ? 'powered' : ''}" />
            ${hasUp ? `<line x1="20" y1="0" x2="20" y2="20" class="circuit-wire ${tile.powered ? 'powered' : ''}" />` : ''}
            ${hasRight ? `<line x1="20" y1="20" x2="40" y2="20" class="circuit-wire ${tile.powered ? 'powered' : ''}" />` : ''}
            ${hasDown ? `<line x1="20" y1="20" x2="20" y2="40" class="circuit-wire ${tile.powered ? 'powered' : ''}" />` : ''}
            ${hasLeft ? `<line x1="0" y1="20" x2="20" y2="20" class="circuit-wire ${tile.powered ? 'powered' : ''}" />` : ''}
            ${tile.isSource ? `<circle cx="20" cy="20" r="7" class="circuit-source-core" /><circle cx="20" cy="20" r="10" class="circuit-source-pulse" />` : ''}
            ${tile.isTerminal ? `<polygon points="20,11 29,20 20,29 11,20" class="circuit-terminal-badge ${tile.powered ? 'energized' : ''}" />` : ''}
            ${tile.hasLeak && tile.powered ? `<circle cx="20" cy="20" r="5" class="circuit-leak-dot" />` : ''}
          </svg>
        `;

        tilesHtml += `
          <div class="circuit-tile ${tile.powered ? 'is-powered' : ''} ${tile.isSource ? 'is-source' : ''} ${tile.isTerminal ? 'is-terminal' : ''} ${isHint ? 'cell-hint-glow' : ''}"
               data-r="${r}" data-c="${c}">
            <div class="circuit-tile-body">
              ${traceSvg}
            </div>
            <span class="circuit-tile-rot-hint">↻</span>
          </div>
        `;
      }
    }

    this.container.innerHTML = `
      <div class="game-panel circuit-panel ${this.solved ? 'is-solved' : ''}">
        <!-- Top HUD -->
        <div class="circuit-hud">
          <div class="hud-card">
            <span class="hud-label">terminals powered</span>
            <div class="hud-value ${poweredTerminals === this.terminals.length ? 'ok' : ''}">
              ${poweredTerminals} / ${this.terminals.length} <span style="font-size:12px;opacity:0.7;">relays</span>
            </div>
          </div>

          <div class="hud-card" style="text-align: center;">
            <span class="hud-label">magnetic loop</span>
            <div class="status-pill ${this.solved ? 'solved' : (poweredTerminals === this.terminals.length && !this.solved ? 'error' : '')}">
              ${this.solved ? '✓ CLOSED CIRCUIT LOCKED' : (poweredTerminals === this.terminals.length ? 'SEAL OPEN LEAKS' : 'FLUX DISPERSION')}
            </div>
          </div>

          <div class="hud-card" style="text-align: right;">
            <span class="hud-label">commutator</span>
            <div class="hud-value">${this.moves} <span style="font-size:12px;opacity:0.7;">moves</span></div>
          </div>
        </div>

        <!-- 4x4 Circuit Grid Stage -->
        <div class="circuit-stage-wrapper">
          <div class="circuit-board">
            ${tilesHtml}
          </div>
        </div>

        <!-- Bottom Controls -->
        <div class="action-btns" style="justify-content: space-between; align-items: center; margin-top: 4px;">
          <button id="circuit-reset-btn" class="btn-secondary" title="Reset all circuit tiles">
            ↺ reset tiles
          </button>

          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
            rotate tiles to power all terminals with zero leaks
          </div>

          <button id="circuit-hint-btn" class="btn-secondary btn-hint ${isCooldown ? 'cooldown-active' : ''}"
                  style="--cooldown-dur: ${remSec}s" ${isCooldown ? 'disabled' : ''}>
            <span class="btn-text">💡 hint (${this.hintsUsed})</span>
            <span class="btn-cooldown-wipe"></span>
          </button>
        </div>
      </div>
    `;

    // Bind click events on tiles
    this.container.querySelectorAll('.circuit-tile').forEach(el => {
      el.addEventListener('click', () => {
        const r = parseInt(el.dataset.r, 10);
        const c = parseInt(el.dataset.c, 10);
        this.handleTileClick(r, c);
      });
    });

    this.container.querySelector('#circuit-hint-btn')?.addEventListener('click', () => this.giveHint());
    this.container.querySelector('#circuit-reset-btn')?.addEventListener('click', () => this.resetPuzzle());

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector('#circuit-hint-btn');
        if (btn) {
          btn.classList.remove('cooldown-active');
          btn.removeAttribute('disabled');
        }
      }, remSec * 1000);
    }
  }
}
