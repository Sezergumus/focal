// GAME 1: DENGE (5x5 Visual Balance Board)
// Simplified & Intuitive: 5x5 grid, center (2,2) is the Pivot ◎.
// 4 Colored Regions: 1 Region already has a locked starter weight (🔒⚫)!
// Player places just 3 weights (1 in each remaining region) so the Center of Mass lands on the center Pivot ◎.
// Includes LIVE HOVER PREVIEW of the Center of Mass!

import { createRNG } from './rng.js';
import { sound } from './audio.js';

const GRID_SIZE = 5;
const NUM_WEIGHTS = 4;
const CENTER = 2; // Exact center index of 5x5 grid (row 2, col 2)

const REGION_PALETTE = [
  { id: 0, name: 'azure (fixed)', bg: 'rgba(14, 165, 233, 0.28)', border: '#38bdf8' },
  { id: 1, name: 'violet', bg: 'rgba(168, 85, 247, 0.28)', border: '#c084fc' },
  { id: 2, name: 'emerald', bg: 'rgba(16, 185, 129, 0.28)', border: '#34d399' },
  { id: 3, name: 'amber', bg: 'rgba(249, 115, 22, 0.28)', border: '#fb923c' },
];

export class DengeGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;
    this.seed = '';
    this.regions = [];       // 5x5 region IDs (0..3)
    this.solution = [];      // 4 {r, c} points whose average is (2, 2)
    this.anchorCell = null;  // Region 0's pre-placed weight {r, c}
    this.lockedEmpty = [];   // 5x5 boolean for pre-placed blockers
    this.board = [];         // 5x5: 0 = empty, 1 = weight (⚫), 2 = cross (✕)
    this.hoverCell = null;   // {r, c} for live balance preview!
    this.hintHighlights = []; // array of {r, c, isError}
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = 0;
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.hoverCell = null;
    this.hintHighlights = [];
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
    this.startTime = Date.now();

    const puzzle = this.generatePuzzle(seedStr);
    this.regions = puzzle.regions;
    this.solution = puzzle.solution;
    this.anchorCell = puzzle.anchorCell;
    this.lockedEmpty = puzzle.lockedEmpty;

    this.initBoardState();
    this.render();
  }

  initBoardState() {
    this.board = Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) => {
        if (r === this.anchorCell.r && c === this.anchorCell.c) return 1;
        if (this.lockedEmpty[r][c]) return 2;
        return 0;
      })
    );
  }

  resetBoard() {
    if (this.solved) return;
    sound.playClick(340);
    this.initBoardState();
    this.render();
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`DENGE_V2_${seedStr}`);

    // All non-center cells on 5x5
    const allCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (r === CENTER && c === CENTER) continue;
        allCells.push({ r, c });
      }
    }

    // Find balanced 4-weight sets (sum of r = 8, sum of c = 8, no two touching even diagonally)
    for (let attempt = 0; attempt < 80; attempt++) {
      const shuffled = rng.shuffle(allCells);
      const targetSolution = this.findBalancedQuad(shuffled);
      if (!targetSolution) continue;

      const regions = this.growRegions(targetSolution, rng);
      if (!regions) continue;

      const anchorCell = targetSolution[0]; // Region 0's weight is pre-placed!
      const lockedEmpty = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
      lockedEmpty[CENTER][CENTER] = true; // Pivot center never holds a weight

      let solutions = this.solveBoard(regions, anchorCell, lockedEmpty);

      let guard = 0;
      while (solutions.length > 1 && guard < 12) {
        guard++;
        const alt = solutions.find(s => !this.sameSolution(s, targetSolution));
        if (!alt) break;
        const diffs = alt.filter(p => !targetSolution.some(t => t.r === p.r && t.c === p.c));
        if (diffs.length === 0) break;
        const pick = rng.pick(diffs);
        lockedEmpty[pick.r][pick.c] = true;
        solutions = this.solveBoard(regions, anchorCell, lockedEmpty);
      }

      if (solutions.length === 1) {
        return {
          regions,
          solution: targetSolution,
          anchorCell,
          lockedEmpty
        };
      }
    }

    return this.generateFallbackPuzzle();
  }

  findBalancedQuad(cells) {
    const n = cells.length;
    for (let i = 0; i < n; i++) {
      const a = cells[i];
      for (let j = i + 1; j < n; j++) {
        const b = cells[j];
        if (this.touches(a, b)) continue;
        for (let k = j + 1; k < n; k++) {
          const c = cells[k];
          if (this.touches(a, c) || this.touches(b, c)) continue;
          // Need 4th point d such that a+b+c+d = (8, 8)
          const dr = 8 - (a.r + b.r + c.r);
          const dc = 8 - (a.c + b.c + c.c);
          if (dr < 0 || dr >= GRID_SIZE || dc < 0 || dc >= GRID_SIZE) continue;
          if (dr === CENTER && dc === CENTER) continue;
          const d = { r: dr, c: dc };
          if (
            (d.r === a.r && d.c === a.c) ||
            (d.r === b.r && d.c === b.c) ||
            (d.r === c.r && d.c === c.c)
          ) continue;
          if (this.touches(a, d) || this.touches(b, d) || this.touches(c, d)) continue;
          return [a, b, c, d];
        }
      }
    }
    return null;
  }

  touches(p1, p2) {
    return Math.abs(p1.r - p2.r) <= 1 && Math.abs(p1.c - p2.c) <= 1;
  }

  sameSolution(solA, solB) {
    return solA.every(a => solB.some(b => b.r === a.r && b.c === a.c));
  }

  growRegions(seeds, rng) {
    const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
    seeds.forEach((pt, idx) => {
      grid[pt.r][pt.c] = idx;
    });

    let unassigned = GRID_SIZE * GRID_SIZE - seeds.length;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    let safety = 0;
    while (unassigned > 0 && safety < 400) {
      safety++;
      const candidates = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (grid[r][c] !== -1) continue;
          const adj = [];
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc] !== -1) {
              // Keep Region 0 (anchor region) compact so player's 3 regions have rich space
              if (grid[nr][nc] !== 0 || rng.next() < 0.35) {
                adj.push(grid[nr][nc]);
              }
            }
          }
          if (adj.length > 0) {
            candidates.push({ r, c, region: rng.pick(adj) });
          }
        }
      }
      if (candidates.length === 0) {
        // Fallback allow any adjacent region
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[r][c] !== -1) continue;
            for (const [dr, dc] of dirs) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc] !== -1) {
                candidates.push({ r, c, region: grid[nr][nc] });
              }
            }
          }
        }
      }
      if (candidates.length === 0) return null;
      const pick = rng.pick(candidates);
      grid[pick.r][pick.c] = pick.region;
      unassigned--;
    }

    return grid;
  }

  solveBoard(regions, anchorCell, lockedEmpty) {
    const regCells = [[anchorCell], [], [], []];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const reg = regions[r][c];
        if (reg > 0 && !lockedEmpty[r][c]) {
          regCells[reg].push({ r, c });
        }
      }
    }

    const solutions = [];
    const chosen = [anchorCell];

    const backtrack = (regIdx) => {
      if (regIdx === NUM_WEIGHTS) {
        const sumR = chosen.reduce((a, p) => a + p.r, 0);
        const sumC = chosen.reduce((a, p) => a + p.c, 0);
        if (sumR === 8 && sumC === 8) {
          solutions.push([...chosen]);
        }
        return;
      }

      for (const cell of regCells[regIdx]) {
        if (chosen.some(prev => this.touches(prev, cell))) continue;
        chosen.push(cell);
        backtrack(regIdx + 1);
        chosen.pop();
        if (solutions.length > 8) return;
      }
    };

    backtrack(1);
    return solutions;
  }

  generateFallbackPuzzle() {
    const regions = [
      [0, 0, 1, 1, 1],
      [0, 0, 1, 1, 1],
      [2, 2, 2, 1, 3],
      [2, 2, 3, 3, 3],
      [2, 2, 3, 3, 3]
    ];
    const solution = [
      { r: 0, c: 1 },
      { r: 1, c: 4 },
      { r: 3, c: 0 },
      { r: 4, c: 3 }
    ];
    const lockedEmpty = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    lockedEmpty[2][2] = true;
    return {
      regions,
      solution,
      anchorCell: solution[0],
      lockedEmpty
    };
  }

  evaluateState(includeHover = false) {
    const weights = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === 1) {
          weights.push({ r, c, region: this.regions[r][c], isHover: false });
        }
      }
    }

    if (
      includeHover &&
      this.hoverCell &&
      this.board[this.hoverCell.r][this.hoverCell.c] === 0 &&
      !this.lockedEmpty[this.hoverCell.r][this.hoverCell.c] &&
      weights.length < NUM_WEIGHTS
    ) {
      weights.push({
        r: this.hoverCell.r,
        c: this.hoverCell.c,
        region: this.regions[this.hoverCell.r][this.hoverCell.c],
        isHover: true
      });
    }

    let netX = 0; // Sum of (c - 2)
    let netY = 0; // Sum of (r - 2)
    for (const w of weights) {
      netX += (w.c - CENTER);
      netY += (w.r - CENTER);
    }

    const conflicts = new Set();
    for (let i = 0; i < weights.length; i++) {
      for (let j = i + 1; j < weights.length; j++) {
        const a = weights[i], b = weights[j];
        if (a.isHover || b.isHover) continue;
        if (a.region === b.region || this.touches(a, b)) {
          conflicts.add(`${a.r},${a.c}`);
          conflicts.add(`${b.r},${b.c}`);
        }
      }
    }

    const realWeights = weights.filter(w => !w.isHover);
    const isCountRight = realWeights.length === NUM_WEIGHTS;
    const realNetX = realWeights.reduce((acc, w) => acc + (w.c - CENTER), 0);
    const realNetY = realWeights.reduce((acc, w) => acc + (w.r - CENTER), 0);
    const isBalanced = realNetX === 0 && realNetY === 0;
    const isWin = isCountRight && isBalanced && conflicts.size === 0;

    return {
      weights,
      realWeights,
      netX,
      netY,
      realNetX,
      realNetY,
      conflicts,
      isBalanced,
      isWin
    };
  }

  handleCellClick(r, c, isRightClick = false) {
    if (this.solved) return;
    if (r === this.anchorCell.r && c === this.anchorCell.c) return;
    if (this.lockedEmpty[r][c]) return;

    const current = this.board[r][c];

    if (isRightClick) {
      this.board[r][c] = current === 2 ? 0 : 2;
      sound.playClick(380, 0.03);
    } else {
      // Quick intuitive toggle:
      // If clicking an empty cell in a region that ALREADY has a weight, move that region's weight here!
      const reg = this.regions[r][c];
      if (current === 0) {
        if (reg === 0) {
          // Region 0 already has the locked anchor weight, so only mark cross
          this.board[r][c] = 2;
          sound.playClick(380, 0.03);
        } else {
          // Clear any existing weight in this same colored region so player doesn't have to manually remove it!
          for (let rr = 0; rr < GRID_SIZE; rr++) {
            for (let cc = 0; cc < GRID_SIZE; cc++) {
              if (this.regions[rr][cc] === reg && this.board[rr][cc] === 1) {
                this.board[rr][cc] = 0;
              }
            }
          }
          this.board[r][c] = 1;
        }
      } else if (current === 1) {
        this.board[r][c] = 0;
      } else {
        this.board[r][c] = 0;
      }
    }

    this.moves++;
    this.hintHighlights = [];
    const state = this.evaluateState(false);

    if (this.board[r][c] === 1) {
      sound.playWeightDrop(Math.hypot(state.realNetX, state.realNetY));
    } else {
      sound.playClick(420, 0.035);
    }

    if (state.isWin && !this.solved) {
      this.solved = true;
      sound.playVictory();
      this.render();
      if (this.onWin) {
        setTimeout(() => this.onWin(this.getShareSummary()), 450);
      }
      return;
    }

    this.render();
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // 1. Check if player placed weights that violate no-touch or are incorrect
    const placedWeights = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === 1) placedWeights.push({ r, c });
      }
    }

    // 1A. Check direct no-touch rule violation among placed weights
    for (let i = 0; i < placedWeights.length; i++) {
      for (let j = i + 1; j < placedWeights.length; j++) {
        const a = placedWeights[i], b = placedWeights[j];
        if (Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1) {
          this.hintHighlights = [{ r: a.r, c: a.c, isError: true }, { r: b.r, c: b.c, isError: true }];
          sound.playErrorBuzz();
          this.render();
          return;
        }
      }
    }

    // 1B. Check if any weight is on an incorrect position
    for (const w of placedWeights) {
      if (w.r === this.anchorCell.r && w.c === this.anchorCell.c) continue;
      const isCorrect = this.solution.some(s => s.r === w.r && s.c === w.c);
      if (!isCorrect) {
        this.hintHighlights = [{ r: w.r, c: w.c, isError: true }];
        sound.playErrorBuzz();
        this.render();
        return;
      }
    }

    sound.playClick(520, 0.05);

    // 2. Visible Reachable Elimination:
    // Any cell touching a currently placed weight CANNOT hold a weight by the no-touch rule!
    const touchEliminations = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === 0 && !this.lockedEmpty[r][c]) {
          const touchesWeight = placedWeights.some(w => Math.abs(w.r - r) <= 1 && Math.abs(w.c - c) <= 1);
          if (touchesWeight) {
            touchEliminations.push({ r, c });
          }
        }
      }
    }

    if (touchEliminations.length > 0) {
      const toCross = touchEliminations.slice(0, 2);
      toCross.forEach(cell => {
        this.board[cell.r][cell.c] = 2;
      });
      this.hintHighlights = toCross.map(cell => ({ r: cell.r, c: cell.c, isError: false }));
      this.render();
      return;
    }

    // 3. Forced Region Placement:
    // If an unsolved region has ONLY 1 remaining non-crossed cell, place weight there!
    for (let i = 1; i < this.solution.length; i++) {
      const sol = this.solution[i];
      if (this.board[sol.r][sol.c] !== 1) {
        const reg = this.regions[sol.r][sol.c];
        const candidates = [];
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (this.regions[r][c] === reg && this.board[r][c] === 0 && !this.lockedEmpty[r][c]) {
              const touchesWeight = placedWeights.some(w => Math.abs(w.r - r) <= 1 && Math.abs(w.c - c) <= 1);
              if (!touchesWeight) candidates.push({ r, c });
            }
          }
        }

        if (candidates.length === 1 && candidates[0].r === sol.r && candidates[0].c === sol.c) {
          this.board[sol.r][sol.c] = 1;
          this.hintHighlights = [{ r: sol.r, c: sol.c, isError: false }];
          sound.playHarmonicLock(i);
          const state = this.evaluateState(false);
          if (state.isWin) {
            this.solved = true;
            sound.playVictory();
            if (this.onWin) setTimeout(() => this.onWin(this.getShareSummary()), 450);
          }
          this.render();
          return;
        }
      }
    }

    // 4. Reachable Center-of-Mass Guidance:
    // Pick the unsolved region that best counteracts the current board tilt
    for (let i = 1; i < this.solution.length; i++) {
      const sol = this.solution[i];
      if (this.board[sol.r][sol.c] !== 1) {
        this.board[sol.r][sol.c] = 1;
        this.hintHighlights = [{ r: sol.r, c: sol.c, isError: false }];
        sound.playHarmonicLock(i);
        const state = this.evaluateState(false);
        if (state.isWin) {
          this.solved = true;
          sound.playVictory();
          if (this.onWin) setTimeout(() => this.onWin(this.getShareSummary()), 450);
        }
        this.render();
        return;
      }
    }

    this.render();
  }

  getShareSummary() {
    const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const gridLines = [];
    const visualCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      let line = '';
      for (let c = 0; c < GRID_SIZE; c++) {
        if (r === CENTER && c === CENTER) {
          line += '◎';
          visualCells.push('pivot');
        } else if (this.board[r][c] === 1) {
          line += '⚫';
          visualCells.push('active');
        } else {
          line += '⬛';
          visualCells.push('empty');
        }
      }
      gridLines.push(line);
    }
    return {
      gameName: 'BALANCE',
      subtitle: '5×5 center of mass balanced',
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: 'time',
      stat1Value: `${elapsedSec}s`,
      stat2Label: 'moves',
      stat2Value: `${this.moves}`,
      stat3Label: 'hints',
      stat3Value: `${this.hintsUsed}`,
      gridCols: 5,
      visualCells,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • balance (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n${gridLines.join('\n')}`
    };
  }

  getBalanceGuidance(netX, netY, count) {
    if (netX === 0 && netY === 0 && count === NUM_WEIGHTS) {
      return 'locked on center';
    }
    const dirs = [];
    if (netY < 0) dirs.push('up');
    if (netY > 0) dirs.push('down');
    if (netX < 0) dirs.push('left');
    if (netX > 0) dirs.push('right');

    if (dirs.length === 0) {
      return `balanced (${count}/${NUM_WEIGHTS})`;
    }
    const pull = [];
    if (netY < 0) pull.push('down');
    if (netY > 0) pull.push('up');
    if (netX < 0) pull.push('right');
    if (netX > 0) pull.push('left');

    return `tilt: <strong>${dirs.join(' ')}</strong> → add weight to <strong>${pull.join(' ')}</strong> side`;
  }

  render() {
    const state = this.evaluateState(true);

    const isCooldown = this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000) : 0;

    const maxTiltDeg = 14;
    const tiltY = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, state.netX * 3.2));
    const tiltX = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, -state.netY * 3.2));

    const bubbleX = Math.max(-38, Math.min(38, state.netX * 11));
    const bubbleY = Math.max(-38, Math.min(38, state.netY * 11));

    const comOffsetX = state.netX * 18;
    const comOffsetY = state.netY * 18;

    const regionCounts = [0, 0, 0, 0];
    state.realWeights.forEach(w => regionCounts[w.region]++);

    this.container.innerHTML = `
      <div class="game-panel denge-panel ${this.solved ? 'is-solved' : ''}">
        <!-- Top Visual HUD -->
        <div class="denge-hud">
          <div class="hud-card">
            <span class="hud-label">weights</span>
            <span class="hud-value ${state.realWeights.length === NUM_WEIGHTS ? 'ok' : ''}">
              ${state.realWeights.length}/${NUM_WEIGHTS}
            </span>
          </div>

          <div class="bubble-level-wrapper">
            <div class="bubble-level-title">center of mass</div>
            <div class="bubble-tube ${state.netX === 0 && state.netY === 0 && state.weights.length === NUM_WEIGHTS ? 'balanced' : ''}">
              <div class="bubble-crosshair-h"></div>
              <div class="bubble-crosshair-v"></div>
              <div class="bubble-target-ring"></div>
              <div id="denge-bubble-dot" class="bubble-dot" style="transform: translate(calc(-50% + ${bubbleX}px), calc(-50% + ${bubbleY}px));"></div>
            </div>
            <div id="denge-guidance-text" class="torque-readout">
              ${this.getBalanceGuidance(state.netX, state.netY, state.weights.length)}
            </div>
          </div>

          <div class="hud-card" style="align-items:flex-end;">
            <span class="hud-label">status</span>
            <span class="status-pill ${this.solved ? 'solved' : state.conflicts.size > 0 ? 'error' : state.isBalanced && state.realWeights.length === NUM_WEIGHTS ? 'solved' : ''}">
              ${this.solved ? 'completed' : state.conflicts.size > 0 ? 'contact detected' : 'balancing'}
            </span>
          </div>
        </div>

        <!-- Region Legend -->
        <div class="denge-regions-bar">
          ${REGION_PALETTE.map((reg, idx) => `
            <div class="region-chip ${regionCounts[idx] === 1 ? 'done' : ''}">
              <span class="region-dot" style="background:${reg.border}"></span>
              <span>${reg.name}</span>
              <strong>${regionCounts[idx] === 1 ? '1/1' : '0/1'}</strong>
            </div>
          `).join('')}
        </div>

        <!-- 5x5 3D Tilt Stage -->
        <div class="denge-stage">
          <div id="denge-board-3d" class="denge-board-3d ${this.solved ? 'board-locked' : ''}"
               style="transform: perspective(780px) rotateX(${tiltX}deg) rotateY(${tiltY}deg);">
            <div class="denge-grid grid-5x5" oncontextmenu="return false;">
              <div id="denge-com-cursor" class="com-cursor ${state.netX === 0 && state.netY === 0 ? 'centered' : ''}"
                   style="transform: translate(calc(-50% + ${comOffsetX}px), calc(-50% + ${comOffsetY}px));"></div>

              ${this.renderGridCells(state)}
            </div>
          </div>
        </div>

        <div class="game-footer-bar">
          <div class="quick-tip">
            place <strong>1 weight in each of the 3 remaining regions</strong> • weights cannot touch
          </div>
          <div class="action-btns">
            <button class="btn-secondary btn-hint ${isCooldown ? 'cooldown-active' : ''}" id="denge-hint-btn" style="--cooldown-dur: ${remSec > 0 ? remSec : 3}s">
              <span class="btn-cooldown-wipe"></span>
              <span class="btn-text">hint</span>
            </button>
            <button class="btn-secondary" id="denge-reset-btn">reset</button>
          </div>
        </div>
      </div>
    `;

    // Bind cell click & hover preview listeners
    this.container.querySelectorAll('.denge-cell').forEach(cellEl => {
      const r = Number(cellEl.dataset.r);
      const c = Number(cellEl.dataset.c);

      cellEl.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleCellClick(r, c, false);
      });

      cellEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handleCellClick(r, c, true);
      });

      cellEl.addEventListener('mouseenter', () => {
        if (this.solved) return;
        this.hoverCell = { r, c };
        this.updateHoverVisuals();
      });

      cellEl.addEventListener('mouseleave', () => {
        if (this.solved) return;
        this.hoverCell = null;
        this.updateHoverVisuals();
      });
    });

    this.container.querySelector('#denge-hint-btn')?.addEventListener('click', () => this.giveHint());
    this.container.querySelector('#denge-reset-btn')?.addEventListener('click', () => this.resetBoard());

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector('#denge-hint-btn');
        if (btn) btn.classList.remove('cooldown-active');
      }, remSec * 1000);
    }
  }

  // Smoothly update tilt & bubble level on hover without rebuilding the DOM
  updateHoverVisuals() {
    const state = this.evaluateState(true);
    const maxTiltDeg = 14;
    const tiltY = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, state.netX * 3.2));
    const tiltX = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, -state.netY * 3.2));
    const bubbleX = Math.max(-38, Math.min(38, state.netX * 11));
    const bubbleY = Math.max(-38, Math.min(38, state.netY * 11));
    const comOffsetX = state.netX * 18;
    const comOffsetY = state.netY * 18;

    const board3d = this.container.querySelector('#denge-board-3d');
    const bubbleDot = this.container.querySelector('#denge-bubble-dot');
    const comCursor = this.container.querySelector('#denge-com-cursor');
    const guidance = this.container.querySelector('#denge-guidance-text');

    if (board3d) {
      board3d.style.transform = `perspective(780px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    }
    if (bubbleDot) {
      bubbleDot.style.transform = `translate(calc(-50% + ${bubbleX}px), calc(-50% + ${bubbleY}px))`;
    }
    if (comCursor) {
      comCursor.style.transform = `translate(calc(-50% + ${comOffsetX}px), calc(-50% + ${comOffsetY}px))`;
      comCursor.classList.toggle('centered', state.netX === 0 && state.netY === 0);
    }
    if (guidance) {
      guidance.innerHTML = this.getBalanceGuidance(state.netX, state.netY, state.weights.length);
    }
  }

  renderGridCells(state) {
    let html = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const regId = this.regions[r][c];
        const pal = REGION_PALETTE[regId];
        const val = this.board[r][c];
        const isAnchor = r === this.anchorCell.r && c === this.anchorCell.c;
        const isCenterPivot = r === CENTER && c === CENTER;
        const isLocked = this.lockedEmpty[r][c] || isAnchor;
        const hasConflict = state.conflicts.has(`${r},${c}`);

        const bTop = r === 0 || this.regions[r - 1][c] !== regId ? `2.5px solid ${pal.border}` : '1px solid rgba(255,255,255,0.08)';
        const bBottom = r === GRID_SIZE - 1 || this.regions[r + 1][c] !== regId ? `2.5px solid ${pal.border}` : '1px solid rgba(255,255,255,0.08)';
        const bLeft = c === 0 || this.regions[r][c - 1] !== regId ? `2.5px solid ${pal.border}` : '1px solid rgba(255,255,255,0.08)';
        const bRight = c === GRID_SIZE - 1 || this.regions[r][c + 1] !== regId ? `2.5px solid ${pal.border}` : '1px solid rgba(255,255,255,0.08)';

        let content = '';
        if (isCenterPivot) {
          content = `<span class="pivot-center-icon" title="Center Pivot">◎</span>`;
        } else if (val === 1) {
          content = `<div class="weight-token ${hasConflict ? 'conflict' : ''} ${isAnchor ? 'anchor-weight' : ''}">
                       <span class="weight-inner">${isAnchor ? '•' : ''}</span>
                     </div>`;
        } else if (val === 2) {
          content = `<span class="cell-cross ${this.lockedEmpty[r][c] ? 'locked' : ''}">${this.lockedEmpty[r][c] ? '·' : '×'}</span>`;
        }

        const hintItem = this.hintHighlights && this.hintHighlights.find(h => h.r === r && h.c === c);
        const hintClass = hintItem ? (hintItem.isError ? 'cell-hint-error' : 'cell-hint-glow') : '';

        html += `
          <div class="denge-cell ${val === 1 ? 'has-weight' : ''} ${isLocked ? 'is-locked' : ''} ${isCenterPivot ? 'is-pivot-cell' : ''} ${hintClass}"
               data-r="${r}" data-c="${c}"
               style="background: ${pal.bg}; border-top:${bTop}; border-bottom:${bBottom}; border-left:${bLeft}; border-right:${bRight};">
            ${content}
          </div>
        `;
      }
    }
    return html;
  }
}
