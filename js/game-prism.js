// MODÜL 05 — PRISM (Optics & Laser Routing Laboratory)
// 5x5 Grid: Rotate mirrors to route the laser beam to all target sensors.

import { createRNG } from './rng.js';
import { sound } from './audio.js';

const GRID_SIZE = 5;

export class PrismGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = '';
    this.grid = []; // 5x5 grid of cell objects: { type, rot, initialRot, isSensor, etc. }
    this.emitter = null; // { r, c, dr, dc }
    this.sensors = []; // array of { r, c, active: bool, isTerminal: bool }
    this.obstacles = []; // array of { r, c }
    this.mirrors = []; // array of { r, c, solutionRot, rot }
    this.laserPath = []; // array of { x, y } in percentage or pixel coords
    this.hitSensorsCount = 0;

    this.moves = 0;
    this.hintsUsed = 0;
    this.startTime = 0;
    this.solved = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.hintHighlightCell = null;
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = Date.now();
    this.hintHighlightCell = null;
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;

    this.generatePuzzle(seedStr);
    this.traceLaser();
    this.render();
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`PRISM_V1_${seedStr}`);

    let generated = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      // 1. Initialize empty 5x5 grid
      const board = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => null)
      );
      const reservedCells = new Set();

      // 2. Choose emitter on an edge pointing inward
      const edge = rng.int(0, 1); // 0=top, 1=left
      let emitter;
      if (edge === 0) {
        emitter = { r: 0, c: rng.int(0, 3), dr: 1, dc: 0 }; // top edge, shooting DOWN
      } else {
        emitter = { r: rng.int(0, 3), c: 0, dr: 0, dc: 1 }; // left edge, shooting RIGHT
      }

      board[emitter.r][emitter.c] = { type: 'emitter', dr: emitter.dr, dc: emitter.dc };
      reservedCells.add(`${emitter.r},${emitter.c}`);

      // 3. Trace a path with 3 to 4 turns (reflections)
      const numTurns = rng.int(3, 4);
      let currR = emitter.r;
      let currC = emitter.c;
      let currDr = emitter.dr;
      let currDc = emitter.dc;

      const pathMirrors = [];
      let success = true;

      for (let t = 0; t < numTurns; t++) {
        // Try stepDist 2 or 1, ensuring no cell on path is reserved or occupied
        let chosenStep = 0;
        let nextR = 0;
        let nextC = 0;

        for (const dist of [rng.int(1, 2), 1]) {
          let clear = true;
          for (let s = 1; s <= dist; s++) {
            const tr = currR + currDr * s;
            const tc = currC + currDc * s;
            if (tr < 0 || tr >= GRID_SIZE || tc < 0 || tc >= GRID_SIZE || reservedCells.has(`${tr},${tc}`) || board[tr][tc]) {
              clear = false;
              break;
            }
          }
          if (clear) {
            chosenStep = dist;
            nextR = currR + currDr * dist;
            nextC = currC + currDc * dist;
            break;
          }
        }

        if (chosenStep === 0) {
          success = false;
          break;
        }

        // Available turns: perpendicular to current direction
        const possibleTurns = [];
        if (currDr !== 0) {
          if (nextC > 0 && !reservedCells.has(`${nextR},${nextC - 1}`) && !board[nextR][nextC - 1]) possibleTurns.push({ dr: 0, dc: -1 });
          if (nextC < GRID_SIZE - 1 && !reservedCells.has(`${nextR},${nextC + 1}`) && !board[nextR][nextC + 1]) possibleTurns.push({ dr: 0, dc: 1 });
        } else {
          if (nextR > 0 && !reservedCells.has(`${nextR - 1},${nextC}`) && !board[nextR - 1][nextC]) possibleTurns.push({ dr: -1, dc: 0 });
          if (nextR < GRID_SIZE - 1 && !reservedCells.has(`${nextR + 1},${nextC}`) && !board[nextR + 1][nextC]) possibleTurns.push({ dr: 1, dc: 0 });
        }

        if (possibleTurns.length === 0) {
          success = false;
          break;
        }

        const newDir = rng.pick(possibleTurns);

        // Determine mirror orientation needed:
        // Mirror angle 0 (/) reflects: (dr, dc) -> (-dc, -dr)
        // Mirror angle 90 (\) reflects: (dr, dc) -> (dc, dr)
        let neededAngle = null;
        if (newDir.dr === -currDc && newDir.dc === -currDr) {
          neededAngle = 0; // '/'
        } else if (newDir.dr === currDc && newDir.dc === currDr) {
          neededAngle = 90; // '\'
        }

        if (neededAngle === null) {
          success = false;
          break;
        }

        // Reserve intermediate cells between curr and next
        let traceR = currR + currDr;
        let traceC = currC + currDc;
        while (traceR !== nextR || traceC !== nextC) {
          reservedCells.add(`${traceR},${traceC}`);
          traceR += currDr;
          traceC += currDc;
        }
        reservedCells.add(`${nextR},${nextC}`);

        board[nextR][nextC] = {
          type: 'mirror',
          solutionRot: neededAngle,
          rot: neededAngle
        };
        pathMirrors.push({ r: nextR, c: nextC, solutionRot: neededAngle });

        currR = nextR;
        currC = nextC;
        currDr = newDir.dr;
        currDc = newDir.dc;
      }

      if (!success || pathMirrors.length < 3) continue;

      // 4. Place terminal target sensor 1 or 2 steps ahead, ensuring path is clear
      let terminalDist = 0;
      let sensorR = 0;
      let sensorC = 0;
      for (const dist of [rng.int(1, 2), 1]) {
        let clear = true;
        for (let s = 1; s <= dist; s++) {
          const tr = currR + currDr * s;
          const tc = currC + currDc * s;
          if (tr < 0 || tr >= GRID_SIZE || tc < 0 || tc >= GRID_SIZE || reservedCells.has(`${tr},${tc}`) || board[tr][tc]) {
            clear = false;
            break;
          }
        }
        if (clear) {
          terminalDist = dist;
          sensorR = currR + currDr * dist;
          sensorC = currC + currDc * dist;
          break;
        }
      }

      if (terminalDist === 0) continue;

      // Reserve path to sensor
      let traceR = currR + currDr;
      let traceC = currC + currDc;
      while (traceR !== sensorR || traceC !== sensorC) {
        reservedCells.add(`${traceR},${traceC}`);
        traceR += currDr;
        traceC += currDc;
      }
      reservedCells.add(`${sensorR},${sensorC}`);

      board[sensorR][sensorC] = { type: 'sensor', isTerminal: true, active: false };
      const sensorsList = [{ r: sensorR, c: sensorC, isTerminal: true }];

      // 5. Add 1 intermediate pass-through sensor along one of the path segments if space permits
      const intermediateCandidates = [];
      for (let i = 0; i < pathMirrors.length - 1; i++) {
        const m1 = pathMirrors[i];
        const m2 = pathMirrors[i + 1];
        const distR = m2.r - m1.r;
        const distC = m2.c - m1.c;
        if (Math.abs(distR) === 2 && distC === 0) {
          const midR = m1.r + distR / 2;
          if (!board[midR][m1.c]) intermediateCandidates.push({ r: midR, c: m1.c });
        } else if (Math.abs(distC) === 2 && distR === 0) {
          const midC = m1.c + distC / 2;
          if (!board[m1.r][midC]) intermediateCandidates.push({ r: m1.r, c: midC });
        }
      }

      if (intermediateCandidates.length > 0) {
        const cand = rng.pick(intermediateCandidates);
        board[cand.r][cand.c] = { type: 'sensor', isTerminal: false, active: false };
        sensorsList.unshift({ r: cand.r, c: cand.c, isTerminal: false });
      }

      // 6. Add 2-3 obstacles ONLY in non-reserved empty cells
      const emptyCells = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (!board[r][c] && !reservedCells.has(`${r},${c}`)) {
            emptyCells.push({ r, c });
          }
        }
      }

      const shuffledEmpty = rng.shuffle(emptyCells);
      const numObstacles = Math.min(shuffledEmpty.length, rng.int(2, 3));
      for (let i = 0; i < numObstacles && shuffledEmpty.length > 0; i++) {
        const cell = shuffledEmpty.pop();
        board[cell.r][cell.c] = { type: 'obstacle' };
      }

      // 7. Verify the unscrambled solution actually reaches all sensors!
      if (!this.testSolve(board, emitter, sensorsList)) {
        continue;
      }

      // 8. Scramble mirrors!
      let scrambleAttempts = 0;
      do {
        for (const m of pathMirrors) {
          const turns = rng.int(1, 3); // 1, 2, or 3 rotations (90°, 180°, 270°)
          const currentRot = (board[m.r][m.c].solutionRot + turns * 90) % 360;
          board[m.r][m.c].rot = currentRot;
          m.rot = currentRot;
        }
        scrambleAttempts++;
      } while (this.testSolve(board, emitter, sensorsList) && scrambleAttempts < 10);

      // Save valid puzzle
      this.grid = board;
      this.emitter = emitter;
      this.sensors = sensorsList;
      this.mirrors = pathMirrors;
      generated = true;
      break;
    }

    if (!generated) {
      this.fallbackPuzzle();
    }
  }

  testSolve(board, emitter, sensorsList) {
    const hits = this.simulateRay(board, emitter);
    if (!sensorsList || sensorsList.length === 0) return false;
    return sensorsList.every(s => hits.some(h => h.r === s.r && h.c === s.c));
  }

  simulateRay(board, emitter) {
    let currR = emitter.r;
    let currC = emitter.c;
    let dr = emitter.dr;
    let dc = emitter.dc;

    const visited = new Set();
    const sensorHits = [];

    for (let step = 0; step < 40; step++) {
      currR += dr;
      currC += dc;

      if (currR < 0 || currR >= GRID_SIZE || currC < 0 || currC >= GRID_SIZE) break;

      const stateKey = `${currR},${currC},${dr},${dc}`;
      if (visited.has(stateKey)) break;
      visited.add(stateKey);

      const cell = board[currR][currC];
      if (!cell) continue;

      if (cell.type === 'obstacle') break;

      if (cell.type === 'sensor') {
        sensorHits.push({ r: currR, c: currC });
        if (cell.isTerminal) break;
      } else if (cell.type === 'mirror') {
        // Reflection
        // Angle 0 or 180 is '/'
        // Angle 90 or 270 is '\'
        const isSlash = (cell.rot % 180 === 0);
        let nextDr, nextDc;
        if (isSlash) {
          nextDr = -dc;
          nextDc = -dr;
        } else {
          nextDr = dc;
          nextDc = dr;
        }
        dr = nextDr;
        dc = nextDc;
      }
    }
    return sensorHits;
  }

  fallbackPuzzle() {
    // Elegant fallback: 5x5 board with 3 mirrors
    const board = Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => null)
    );
    const emitter = { r: 0, c: 1, dr: 1, dc: 0 };
    board[0][1] = { type: 'emitter', dr: 1, dc: 0 };

    board[3][1] = { type: 'mirror', solutionRot: 0, rot: 90 }; // '/' turns down to right
    board[3][3] = { type: 'mirror', solutionRot: 0, rot: 90 }; // '/' turns right to up
    board[1][3] = { type: 'mirror', solutionRot: 90, rot: 0 }; // '\' turns up to right
    board[1][4] = { type: 'sensor', isTerminal: true, active: false };

    board[4][2] = { type: 'obstacle' };
    board[0][4] = { type: 'obstacle' };

    this.grid = board;
    this.emitter = emitter;
    this.sensors = [{ r: 1, c: 4, isTerminal: true }];
    this.mirrors = [
      { r: 3, c: 1, solutionRot: 0, rot: 90 },
      { r: 3, c: 3, solutionRot: 0, rot: 90 },
      { r: 1, c: 3, solutionRot: 90, rot: 0 }
    ];
  }

  traceLaser() {
    // Reset sensor activations
    this.sensors.forEach(s => {
      s.active = false;
      if (this.grid[s.r][s.c]) this.grid[s.r][s.c].active = false;
    });

    const path = [];
    const cellSize = 100 / GRID_SIZE; // percentage per cell
    const halfCell = cellSize / 2;

    // Start at emitter center
    let currR = this.emitter.r;
    let currC = this.emitter.c;
    let dr = this.emitter.dr;
    let dc = this.emitter.dc;

    path.push({
      x: currC * cellSize + halfCell,
      y: currR * cellSize + halfCell
    });

    const visited = new Set();
    let hitCount = 0;

    for (let step = 0; step < 40; step++) {
      currR += dr;
      currC += dc;

      // Check boundary exit
      if (currR < 0 || currR >= GRID_SIZE || currC < 0 || currC >= GRID_SIZE) {
        // Extend ray to the border
        const lastX = path[path.length - 1].x;
        const lastY = path[path.length - 1].y;
        let borderX = lastX;
        let borderY = lastY;
        if (dc === 1) borderX = 100;
        else if (dc === -1) borderX = 0;
        if (dr === 1) borderY = 100;
        else if (dr === -1) borderY = 0;

        path.push({ x: borderX, y: borderY });
        break;
      }

      const cellX = currC * cellSize + halfCell;
      const cellY = currR * cellSize + halfCell;

      const stateKey = `${currR},${currC},${dr},${dc}`;
      if (visited.has(stateKey)) {
        // Cycle detected: draw to center and stop
        path.push({ x: cellX, y: cellY });
        break;
      }
      visited.add(stateKey);

      const cell = this.grid[currR][currC];

      if (!cell) {
        // empty space: continue
        continue;
      }

      if (cell.type === 'obstacle') {
        // Stop ray at obstacle face/center
        path.push({ x: cellX, y: cellY });
        break;
      }

      if (cell.type === 'sensor') {
        cell.active = true;
        const sObj = this.sensors.find(s => s.r === currR && s.c === currC);
        if (sObj) sObj.active = true;
        hitCount++;

        path.push({ x: cellX, y: cellY });

        if (cell.isTerminal) {
          break; // Terminal receptor absorbs beam
        }
      } else if (cell.type === 'mirror') {
        // Deflect at mirror center
        path.push({ x: cellX, y: cellY });

        const isSlash = (cell.rot % 180 === 0);
        let nextDr, nextDc;
        if (isSlash) {
          nextDr = -dc;
          nextDc = -dr;
        } else {
          nextDr = dc;
          nextDc = dr;
        }
        dr = nextDr;
        dc = nextDc;
      }
    }

    this.laserPath = path;
    this.hitSensorsCount = hitCount;

    // Check win condition: all sensors active!
    const allSensorsActive = this.sensors.length > 0 && this.sensors.every(s => s.active);

    if (allSensorsActive && !this.solved) {
      this.solved = true;
      sound.playPrismSensorHit();
      setTimeout(() => sound.playVictory(), 240);
      if (this.onWin) {
        setTimeout(() => this.onWin(this.getShareSummary()), 500);
      }
    }
  }

  handleMirrorClick(r, c) {
    if (this.solved) return;
    const cell = this.grid[r][c];
    if (!cell || cell.type !== 'mirror') return;

    sound.playPrismRotate();
    this.moves++;
    cell.rot = (cell.rot + 90) % 360;

    // Clear hint highlight on user interaction
    this.hintHighlightCell = null;

    this.traceLaser();
    this.render();
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // Find a mirror that is currently not in its correct orientation
    const wrongMirror = this.mirrors.find(m => {
      const cell = this.grid[m.r][m.c];
      return (cell.rot % 180) !== (cell.solutionRot % 180);
    });

    if (wrongMirror) {
      const cell = this.grid[wrongMirror.r][wrongMirror.c];
      cell.rot = cell.solutionRot;
      this.hintHighlightCell = { r: wrongMirror.r, c: wrongMirror.c };
      sound.playPrismRotate();
      this.traceLaser();
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
        const item = this.grid[r][c];
        if (item?.type === 'emitter') visualCells.push({ type: 'pivot', label: '◉' });
        else if (item?.type === 'sensor') visualCells.push({ type: 'emerald', label: '◆' });
        else if (item?.type === 'mirror') visualCells.push({ type: 'blue', label: '╱' });
        else if (item?.type === 'obstacle') visualCells.push({ type: 'empty', label: '■' });
        else visualCells.push('empty');
      }
    }

    return {
      gameName: 'PRISM',
      subtitle: `${this.sensors.length}/${this.sensors.length} optical sensors locked`,
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: 'time',
      stat1Value: `${elapsedSec}s`,
      stat2Label: 'moves',
      stat2Value: `${this.moves}`,
      stat3Label: 'sensors',
      stat3Value: `${this.sensors.length}/${this.sensors.length}`,
      gridCols: 5,
      visualCells,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • prism (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n⚡ sensors locked: ${this.sensors.length}/${this.sensors.length}`
    };
  }

  render() {
    const isCooldown = this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000) : 0;

    // SVG Polyline points
    const pointsStr = this.laserPath.map(p => `${p.x},${p.y}`).join(' ');

    let cellsHtml = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const item = this.grid[r][c];
        const isHint = this.hintHighlightCell && this.hintHighlightCell.r === r && this.hintHighlightCell.c === c;

        let innerContent = '';
        let cellClass = 'prism-cell';

        if (!item) {
          cellClass += ' cell-empty';
          innerContent = `<span class="prism-grid-dot"></span>`;
        } else if (item.type === 'emitter') {
          cellClass += ' cell-emitter';
          const arrow = item.dr === 1 ? '↓' : item.dr === -1 ? '↑' : item.dc === 1 ? '→' : '←';
          innerContent = `
            <div class="emitter-core" title="Laser Emitter">
              <span class="emitter-beam-icon">◉</span>
              <span class="emitter-arrow">${arrow}</span>
            </div>
          `;
        } else if (item.type === 'sensor') {
          cellClass += ` cell-sensor ${item.active ? 'is-active' : ''}`;
          innerContent = `
            <div class="sensor-receptor ${item.active ? 'active-glow' : ''}" title="${item.isTerminal ? 'Terminal Sensor' : 'Pass Sensor'}">
              <div class="sensor-ring"></div>
              <span class="sensor-glyph">◆</span>
              <span class="sensor-pulse-wave"></span>
            </div>
          `;
        } else if (item.type === 'mirror') {
          cellClass += ` cell-mirror ${isHint ? 'cell-hint-glow' : ''}`;
          // 45 deg or 135 deg mirror line
          innerContent = `
            <div class="mirror-housing" style="transform: rotate(${item.rot}deg);" title="Click to Rotate 90°">
              <div class="mirror-bezel"></div>
              <div class="mirror-glass"></div>
              <span class="mirror-pivot-dot"></span>
            </div>
            <span class="mirror-rotate-hint">↻</span>
          `;
        } else if (item.type === 'obstacle') {
          cellClass += ' cell-obstacle';
          innerContent = `<div class="obstacle-block" title="Obstacle Block">■</div>`;
        }

        cellsHtml += `
          <div class="${cellClass}" data-r="${r}" data-c="${c}">
            ${innerContent}
          </div>
        `;
      }
    }

    this.container.innerHTML = `
      <div class="game-panel prism-panel ${this.solved ? 'is-solved' : ''}">
        <!-- Top HUD -->
        <div class="prism-hud">
          <div class="hud-card">
            <span class="hud-label">laser target</span>
            <div class="hud-value ${this.hitSensorsCount === this.sensors.length ? 'ok' : ''}">
              ${this.hitSensorsCount} / ${this.sensors.length} <span style="font-size:12px;opacity:0.7;">sensors</span>
            </div>
          </div>

          <div class="hud-card" style="text-align: center;">
            <span class="hud-label">optical status</span>
            <div class="status-pill ${this.solved ? 'solved' : ''}">
              ${this.solved ? '✓ RESONANCE LOCKED' : 'EMITTING BEAM 488nm'}
            </div>
          </div>

          <div class="hud-card" style="text-align: right;">
            <span class="hud-label">reflections</span>
            <div class="hud-value">${this.moves} <span style="font-size:12px;opacity:0.7;">moves</span></div>
          </div>
        </div>

        <!-- 5x5 Optical Laser Stage -->
        <div class="prism-stage-wrapper">
          <div class="prism-board" id="prism-grid-board">
            ${cellsHtml}

            <!-- Real-time Ray Tracing SVG Overlay -->
            <svg class="prism-laser-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <filter id="laser-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <!-- Outer Glow Beam -->
              <polyline points="${pointsStr}" class="laser-beam-outer" />
              <!-- Core Bright Beam -->
              <polyline points="${pointsStr}" class="laser-beam-core" filter="url(#laser-glow)" />
            </svg>
          </div>
        </div>

        <!-- Bottom Action Buttons -->
        <div class="action-btns" style="justify-content: space-between; align-items: center; margin-top: 4px;">
          <button id="prism-reset-btn" class="btn-secondary" title="Reset all mirrors">
            ↺ reset mirrors
          </button>

          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
            click mirror to deflect beam 90°
          </div>

          <button id="prism-hint-btn" class="btn-secondary btn-hint ${isCooldown ? 'cooldown-active' : ''}"
                  style="--cooldown-dur: ${remSec}s" ${isCooldown ? 'disabled' : ''}>
            <span class="btn-text">💡 hint (${this.hintsUsed})</span>
            <span class="btn-cooldown-wipe"></span>
          </button>
        </div>
      </div>
    `;

    // Bind event listeners
    this.container.querySelectorAll('.cell-mirror').forEach(el => {
      el.addEventListener('click', () => {
        const r = parseInt(el.dataset.r, 10);
        const c = parseInt(el.dataset.c, 10);
        this.handleMirrorClick(r, c);
      });
    });

    this.container.querySelector('#prism-hint-btn')?.addEventListener('click', () => this.giveHint());
    this.container.querySelector('#prism-reset-btn')?.addEventListener('click', () => this.resetPuzzle());

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector('#prism-hint-btn');
        if (btn) {
          btn.classList.remove('cooldown-active');
          btn.removeAttribute('disabled');
        }
      }, remSec * 1000);
    }
  }
}
