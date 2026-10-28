// INSTRUMENT 01: BALANCE (Lighthouse Pendulum & Counterweights)
// Steady the lighthouse against the coastal wind by settling the counterweights
// on the 6x6 cedar gimbal table until the center of mass rests on the pivot at the middle of the board
// (the crossing point between the four central squares).
// - 4 inlaid regions: Region 0 (Sea-Glass) holds a bolted starter counterweight.
// - Place 1 counterweight in each of the 3 remaining regions.
// - No two counterweights may touch, not even diagonally.
// - Hovering over any open cell previews the pendulum swing and center of mass in real time.

import { createRNG } from './rng.js';
import { sound } from './audio.js';
import { ico } from './icons.js';

const GRID_SIZE = 6;
const NUM_WEIGHTS = 4;
const CENTER = 2.5; // The pivot sits on the corner shared by the four middle squares
const SUM_TARGET = CENTER * NUM_WEIGHTS; // row (and column) indices of a balanced set add up to this
const CELL_UNITS = 50; // overlay SVG units per square; the overlay is GRID_SIZE * CELL_UNITS wide
const OVERLAY_SIZE = GRID_SIZE * CELL_UNITS;
const OVERLAY_MID = OVERLAY_SIZE / 2;

const REGION_PALETTE = [
  {
    id: 0,
    name: 'sea-glass',
    label: 'sea-glass (bolted)',
    bg: 'rgba(92, 168, 198, 0.20)',
    border: '#7bc8e2',
    gem: '#9bd1e5',
    core: '#d8f3fc'
  },
  {
    id: 1,
    name: 'twilight plum',
    label: 'twilight plum',
    bg: 'rgba(164, 120, 214, 0.20)',
    border: '#c4a1ec',
    gem: '#d8b8f0',
    core: '#f3e6ff'
  },
  {
    id: 2,
    name: 'harbor sage',
    label: 'harbor sage',
    bg: 'rgba(94, 184, 152, 0.20)',
    border: '#8bd6b8',
    gem: '#9fe3c4',
    core: '#dffced'
  },
  {
    id: 3,
    name: 'hearth amber',
    label: 'hearth amber',
    bg: 'rgba(228, 154, 88, 0.20)',
    border: '#f4b978',
    gem: '#ffd978',
    core: '#fff4d4'
  }
];

export class DengeGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;
    this.seed = '';
    this.regions = [];        // 6x6 region IDs (0..3)
    this.solution = [];       // 4 {r, c} points whose average is the board center
    this.anchorCell = null;   // Region 0's pre-placed weight {r, c}
    this.lockedEmpty = [];    // 6x6 boolean for pre-placed structural plugs
    this.board = [];          // 6x6: 0 = empty, 1 = weight, 2 = player cross (×)
    this.hoverCell = null;    // {r, c} for live balance preview
    this.hintHighlights = []; // array of {r, c, isError}
    this.hintMessage = null;
    this.hintIsError = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.history = [];
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = 0;
  }

  pushHistory() {
    this.history.push(this.board.map(row => [...row]));
    if (this.history.length > 60) this.history.shift();
  }

  undo() {
    if (this.solved || this.history.length === 0) return;
    sound.playClick(380);
    this.board = this.history.pop();
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
    this.render();
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.hoverCell = null;
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
    this.history = [];
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
    this.history = [];
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
    this.initBoardState();
    this.render();
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`DENGE_V2_${seedStr}`);

    const allCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        allCells.push({ r, c });
      }
    }

    for (let attempt = 0; attempt < 80; attempt++) {
      const shuffled = rng.shuffle(allCells);
      const targetSolution = this.findBalancedQuad(shuffled);
      if (!targetSolution) continue;

      const regions = this.growRegions(targetSolution, rng);
      if (!regions) continue;

      const anchorCell = targetSolution[0];
      const lockedEmpty = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));

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
          const dr = SUM_TARGET - (a.r + b.r + c.r);
          const dc = SUM_TARGET - (a.c + b.c + c.c);
          if (dr < 0 || dr >= GRID_SIZE || dc < 0 || dc >= GRID_SIZE) continue;
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
        if (sumR === SUM_TARGET && sumC === SUM_TARGET) {
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
      [0, 0, 0, 1, 1, 1],
      [0, 0, 0, 1, 1, 1],
      [2, 2, 2, 3, 1, 1],
      [2, 2, 3, 3, 3, 3],
      [2, 2, 3, 3, 3, 3],
      [2, 2, 2, 3, 3, 3]
    ];
    const solution = [
      { r: 0, c: 1 },
      { r: 1, c: 4 },
      { r: 4, c: 0 },
      { r: 5, c: 5 }
    ];
    const lockedEmpty = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    // Plugs that leave this layout with exactly one solution
    [[0, 3], [0, 4], [0, 5], [1, 3], [1, 5], [2, 4], [2, 5], [4, 1], [5, 0], [5, 1]].forEach(([r, c]) => {
      lockedEmpty[r][c] = true;
    });
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

    // If hovering over an empty playable cell in a non-anchor region:
    // preview either moving that region's weight here or adding a new weight
    let hoverPreview = null;
    if (
      includeHover &&
      this.hoverCell &&
      this.board[this.hoverCell.r][this.hoverCell.c] === 0 &&
      !this.lockedEmpty[this.hoverCell.r][this.hoverCell.c]
    ) {
      const hr = this.hoverCell.r;
      const hc = this.hoverCell.c;
      const hReg = this.regions[hr][hc];
      if (hReg > 0) {
        hoverPreview = { r: hr, c: hc, region: hReg, isHover: true };
        // Replace existing weight in same region during preview so it matches click behavior
        const existingIdx = weights.findIndex(w => !w.isHover && w.region === hReg);
        if (existingIdx !== -1) {
          weights.splice(existingIdx, 1);
        }
        weights.push(hoverPreview);
      }
    }

    let netX = 0;
    let netY = 0;
    for (const w of weights) {
      netX += (w.c - CENTER);
      netY += (w.r - CENTER);
    }

    const realWeights = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === 1) {
          realWeights.push({ r, c, region: this.regions[r][c], isHover: false });
        }
      }
    }

    const conflicts = new Set();
    for (let i = 0; i < realWeights.length; i++) {
      for (let j = i + 1; j < realWeights.length; j++) {
        const a = realWeights[i], b = realWeights[j];
        if (a.region === b.region || this.touches(a, b)) {
          conflicts.add(`${a.r},${a.c}`);
          conflicts.add(`${b.r},${b.c}`);
        }
      }
    }

    const isCountRight = realWeights.length === NUM_WEIGHTS;
    const realNetX = realWeights.reduce((acc, w) => acc + (w.c - CENTER), 0);
    const realNetY = realWeights.reduce((acc, w) => acc + (w.r - CENTER), 0);
    const isBalanced = realNetX === 0 && realNetY === 0;
    const isWin = isCountRight && isBalanced && conflicts.size === 0;

    return {
      weights,
      realWeights,
      hoverPreview,
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
    if (this.lockedEmpty[r][c]) {
      const blockedEl = this.container.querySelector(`.denge-cell[data-r="${r}"][data-c="${c}"]`);
      if (blockedEl && blockedEl.classList.contains('is-blocked')) {
        blockedEl.classList.remove('is-denied');
        void blockedEl.offsetWidth;
        blockedEl.classList.add('is-denied');
        sound.playClick(160, 0.05);
      }
      return;
    }

    this.pushHistory();
    const current = this.board[r][c];

    if (isRightClick) {
      this.board[r][c] = current === 2 ? 0 : 2;
      sound.playClick(380, 0.03);
    } else {
      const reg = this.regions[r][c];
      if (current === 0) {
        if (reg === 0) {
          this.board[r][c] = 2;
          sound.playClick(380, 0.03);
        } else {
          for (let rr = 0; rr < GRID_SIZE; rr++) {
            for (let cc = 0; cc < GRID_SIZE; cc++) {
              if (this.regions[rr][cc] === reg && this.board[rr][cc] === 1) {
                this.board[rr][cc] = 0;
              }
            }
          }
          this.board[r][c] = 1;
        }
      } else {
        this.board[r][c] = 0;
      }
    }

    this.moves++;
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
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
    this.pushHistory();

    const placedWeights = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === 1) placedWeights.push({ r, c });
      }
    }

    // 1A. Direct no-touch violation
    for (let i = 0; i < placedWeights.length; i++) {
      for (let j = i + 1; j < placedWeights.length; j++) {
        const a = placedWeights[i], b = placedWeights[j];
        if (Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1) {
          this.hintHighlights = [{ r: a.r, c: a.c, isError: true }, { r: b.r, c: b.c, isError: true }];
          this.hintIsError = true;
          this.hintMessage = `Row ${a.r + 1}, Col ${a.c + 1} & Row ${b.r + 1}, Col ${b.c + 1}: Counterweights cannot touch each other.`;
          sound.playErrorBuzz();
          this.render();
          return;
        }
      }
    }

    // 1B. Weight placed on an incorrect square
    for (const w of placedWeights) {
      if (w.r === this.anchorCell.r && w.c === this.anchorCell.c) continue;
      const isCorrect = this.solution.some(s => s.r === w.r && s.c === w.c);
      if (!isCorrect) {
        const regName = REGION_PALETTE[this.regions[w.r][w.c]].name;
        this.hintHighlights = [{ r: w.r, c: w.c, isError: true }];
        this.hintIsError = true;
        this.hintMessage = `The ${regName} counterweight at Row ${w.r + 1}, Col ${w.c + 1} pulls the pendulum off-center.`;
        sound.playErrorBuzz();
        this.render();
        return;
      }
    }

    sound.playClick(520, 0.05);

    // 2. Eliminate squares touching already-placed correct weights
    const touchEliminations = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === 0 && !this.lockedEmpty[r][c] && this.regions[r][c] !== 0) {
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
      this.hintIsError = false;
      this.hintMessage = `Crossed out the squares beside a counterweight: weights never touch.`;
      this.render();
      return;
    }

    // 3. Place a counterweight in an unsolved region
    for (let i = 1; i < this.solution.length; i++) {
      const sol = this.solution[i];
      if (this.board[sol.r][sol.c] !== 1) {
        const reg = this.regions[sol.r][sol.c];
        for (let rr = 0; rr < GRID_SIZE; rr++) {
          for (let cc = 0; cc < GRID_SIZE; cc++) {
            if (this.regions[rr][cc] === reg && this.board[rr][cc] === 1) {
              this.board[rr][cc] = 0;
            }
          }
        }
        this.board[sol.r][sol.c] = 1;
        this.hintHighlights = [{ r: sol.r, c: sol.c, isError: false }];
        this.hintIsError = false;
        this.hintMessage = `Settled the ${REGION_PALETTE[reg].name} counterweight at Row ${sol.r + 1}, Col ${sol.c + 1}.`;
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
        if (this.board[r][c] === 1) {
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
      subtitle: 'The tower stands in equilibrium',
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
      gridCols: GRID_SIZE,
      visualCells,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • balance (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n${gridLines.join('\n')}`
    };
  }

  getBalanceGuidance(netX, netY, count, hasConflict, isPreview) {
    if (hasConflict) {
      return 'two counterweights are touching: give them a little space';
    }
    if (netX === 0 && netY === 0 && count === NUM_WEIGHTS) {
      return isPreview
        ? 'this square would settle the tower'
        : 'the tower stands in equilibrium';
    }
    const dirs = [];
    if (netY < 0) dirs.push('north');
    if (netY > 0) dirs.push('south');
    if (netX < 0) dirs.push('west');
    if (netX > 0) dirs.push('east');

    if (dirs.length === 0) {
      return `centered so far, ${count}/${NUM_WEIGHTS} counterweights placed`;
    }
    const pull = [];
    if (netY < 0) pull.push('south');
    if (netY > 0) pull.push('north');
    if (netX < 0) pull.push('east');
    if (netX > 0) pull.push('west');

    const lean = isPreview ? 'it would lean' : 'the tower leans';
    return `${lean} <strong>${dirs.join('-')}</strong>: add weight toward <strong>${pull.join('-')}</strong>`;
  }

  // Top Brass Spirit Vial & Lighthouse Pendulum Chamber
  renderPendulumChamber(state) {
    const isEquilibrium = state.netX === 0 && state.netY === 0 && state.weights.length === NUM_WEIGHTS && state.conflicts.size === 0;
    const hasConflict = state.conflicts.size > 0;
    const bubbleX = Math.max(-44, Math.min(44, state.netX * 11));
    const bubbleY = Math.max(-9, Math.min(9, state.netY * 2.5));
    const bobX = Math.max(-16, Math.min(16, state.netX * 4.2));
    const bobY = Math.max(-16, Math.min(16, state.netY * 4.2));

    let ticks = '';
    for (let x = -80; x <= 80; x += 20) {
      if (x === 0) continue;
      const major = Math.abs(x) === 40 || Math.abs(x) === 80;
      ticks += `<line x1="${142 + x}" y1="${major ? 16 : 19}" x2="${142 + x}" y2="${major ? 46 : 43}" class="bl-vial-tick ${major ? 'major' : ''}" />`;
    }

    return `
      <div class="bl-chamber ${isEquilibrium ? 'is-still' : hasConflict ? 'is-clash' : ''}" id="denge-chamber">
        <div class="bl-chamber-top">
          <span class="bl-chamber-title">The tower&rsquo;s sway</span>
          <span class="bl-weight-count ${state.realWeights.length === NUM_WEIGHTS ? 'is-full' : ''}">${state.realWeights.length}/${NUM_WEIGHTS} weights settled</span>
        </div>

        <svg viewBox="0 0 380 62" class="bl-chamber-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="bl-vial-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(255, 238, 205, 0.14)" />
              <stop offset="50%" stop-color="rgba(20, 16, 34, 0.55)" />
              <stop offset="100%" stop-color="rgba(255, 217, 120, 0.10)" />
            </linearGradient>
            <radialGradient id="bl-bubble-grad" cx="35%" cy="32%" r="68%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="45%" stop-color="#ffe8b3" />
              <stop offset="100%" stop-color="#f59e0b" />
            </radialGradient>
          </defs>

          <!-- Left/Center: Brass Spirit Level Tube -->
          <g class="bl-spirit-vial">
            <!-- Outer brass frame & end caps -->
            <rect x="24" y="13" width="236" height="36" rx="18" class="bl-vial-body" fill="url(#bl-vial-glass)" />
            <path d="M 38 13 L 38 49 M 246 13 L 246 49" class="bl-vial-cap-seam" />
            <circle cx="31" cy="23" r="1.4" class="bl-rivet" />
            <circle cx="31" cy="39" r="1.4" class="bl-rivet" />
            <circle cx="253" cy="23" r="1.4" class="bl-rivet" />
            <circle cx="253" cy="39" r="1.4" class="bl-rivet" />

            <!-- Horizon & calibration ticks -->
            <line x1="40" y1="31" x2="244" y2="31" class="bl-vial-axis" />
            <line x1="142" y1="14" x2="142" y2="48" class="bl-vial-axis" />
            ${ticks}

            <!-- Center target ring -->
            <circle cx="142" cy="31" r="12" class="bl-vial-target-outer" />
            <circle cx="142" cy="31" r="7.5" class="bl-vial-target-inner" />

            <!-- Live Spirit Bubble -->
            <g id="denge-bubble-dot" class="bl-bubble-group" style="transform: translate(${bubbleX}px, ${bubbleY}px);">
              <circle cx="142" cy="31" r="9.5" class="bl-bubble-halo" />
              <circle cx="142" cy="31" r="6.8" fill="url(#bl-bubble-grad)" class="bl-bubble-core" />
              <circle cx="139.6" cy="28.6" r="1.9" fill="#ffffff" opacity="0.9" />
            </g>

            <!-- Glass top specular reflection -->
            <path d="M 48 17.5 L 236 17.5" class="bl-vial-specular" />
          </g>

          <!-- Right: Circular Plumb-Bob Compass Dial -->
          <g class="bl-plumb-dial" transform="translate(324, 31)">
            <circle cx="0" cy="0" r="24" class="bl-dial-outer" />
            <circle cx="0" cy="0" r="19" class="bl-dial-inner" />
            <line x1="-22" y1="0" x2="22" y2="0" class="bl-vial-axis" />
            <line x1="0" y1="-22" x2="0" y2="22" class="bl-vial-axis" />
            <circle cx="0" cy="0" r="5.5" class="bl-dial-center-ring" />

            <!-- Plumb line & bob -->
            <line id="denge-plumb-line" x1="0" y1="0" x2="${bobX}" y2="${bobY}" class="bl-plumb-wire" />
            <g id="denge-plumb-bob" style="transform: translate(${bobX}px, ${bobY}px);">
              <circle cx="0" cy="0" r="5.8" class="bl-bob-halo" />
              <circle cx="0" cy="0" r="3.8" class="bl-bob-core" />
              <circle cx="-1" cy="-1" r="1.1" fill="#ffffff" />
            </g>
          </g>
        </svg>

        <div id="denge-guidance-text" class="bl-chamber-caption ${this.solved ? 'done' : hasConflict ? 'over' : ''}">
          ${this.getBalanceGuidance(state.netX, state.netY, state.weights.length, hasConflict, Boolean(state.hoverPreview))}
        </div>
      </div>
    `;
  }

  // Board SVG overlay showing subtle brass tension lines from each placed weight to the Center of Mass
  renderBoardOverlaySvg(state) {
    // The grid maps onto an OVERLAY_SIZE square (each cell center is c*CELL_UNITS + CELL_UNITS/2)
    const comX = Math.max(20, Math.min(OVERLAY_SIZE - 20, OVERLAY_MID + state.netX * 16));
    const comY = Math.max(20, Math.min(OVERLAY_SIZE - 20, OVERLAY_MID + state.netY * 16));
    const isCentered = state.netX === 0 && state.netY === 0;

    let lines = '';
    for (const w of state.weights) {
      const wx = w.c * CELL_UNITS + CELL_UNITS / 2;
      const wy = w.r * CELL_UNITS + CELL_UNITS / 2;
      const pal = REGION_PALETTE[w.region];
      lines += `<line x1="${wx}" y1="${wy}" x2="${comX}" y2="${comY}" stroke="${pal.gem}" class="bl-tension-line ${w.isHover ? 'is-ghost' : ''} ${isCentered ? 'is-centered' : ''}" />`;
    }

    return `
      <svg id="denge-overlay-svg" viewBox="0 0 ${OVERLAY_SIZE} ${OVERLAY_SIZE}" class="bl-board-overlay-svg" preserveAspectRatio="none">
        ${this.renderPivotSvg(state.netX === 0 && state.netY === 0)}
        <g id="denge-tension-lines">${lines}</g>
        <!-- Center-of-Mass Plumb-Bob Marker on the Board -->
        <g id="denge-com-svg" class="bl-com-marker ${isCentered ? 'is-centered' : ''}" transform="translate(${comX}, ${comY})">
          <circle cx="0" cy="0" r="14" class="bl-com-ring-outer" />
          <circle cx="0" cy="0" r="8" class="bl-com-ring-inner" />
          <line x1="-17" y1="0" x2="-10" y2="0" class="bl-com-tick" />
          <line x1="10" y1="0" x2="17" y2="0" class="bl-com-tick" />
          <line x1="0" y1="-17" x2="0" y2="-10" class="bl-com-tick" />
          <line x1="0" y1="10" x2="0" y2="17" class="bl-com-tick" />
        </g>
      </svg>
    `;
  }

  // Brass Gimbal Fulcrum at the middle of the board, drawn over the corner the four central squares share
  renderPivotSvg(isBalanced) {
    const scale = 0.6;
    const offset = OVERLAY_MID - 24 * scale;
    return `
      <g transform="translate(${offset}, ${offset}) scale(${scale})" class="bl-pivot-svg ${isBalanced ? 'is-balanced' : ''}">
        <circle cx="24" cy="24" r="19" class="bl-pivot-outer-ring" />
        <circle cx="24" cy="24" r="13.5" class="bl-pivot-mid-ring" />
        <line x1="24" y1="2" x2="24" y2="9" class="bl-pivot-spoke" />
        <line x1="24" y1="39" x2="24" y2="46" class="bl-pivot-spoke" />
        <line x1="2" y1="24" x2="9" y2="24" class="bl-pivot-spoke" />
        <line x1="39" y1="24" x2="46" y2="24" class="bl-pivot-spoke" />
        <polygon points="24,13 26.8,21.2 35,24 26.8,26.8 24,35 21.2,26.8 13,24 21.2,21.2" class="bl-pivot-star" />
        <circle cx="24" cy="24" r="5.2" class="bl-pivot-jewel" />
        <circle cx="22.6" cy="22.6" r="1.5" fill="#ffffff" opacity="0.9" />
      </g>
    `;
  }

  // Sculptural Brass & Gemstone Counterweight Medallion SVG
  renderWeightSvg(regId, isAnchor, hasConflict, isGhost = false) {
    const pal = REGION_PALETTE[regId];
    const strokeCol = hasConflict ? '#f43f5e' : pal.gem;
    const coreCol = hasConflict ? '#fecdd3' : pal.core;

    const bolts = isAnchor
      ? `
        <circle cx="9.5" cy="9.5" r="1.7" class="bl-weight-bolt" />
        <circle cx="34.5" cy="9.5" r="1.7" class="bl-weight-bolt" />
        <circle cx="9.5" cy="34.5" r="1.7" class="bl-weight-bolt" />
        <circle cx="34.5" cy="34.5" r="1.7" class="bl-weight-bolt" />
      `
      : '';

    return `
      <svg viewBox="0 0 44 44" class="bl-weight-svg ${isAnchor ? 'is-anchor' : ''} ${hasConflict ? 'is-conflict' : ''} ${isGhost ? 'is-ghost' : ''}">
        <circle cx="22" cy="22" r="17.5" class="bl-weight-shadow" />
        <circle cx="22" cy="22" r="16" class="bl-weight-rim" stroke="${strokeCol}" />
        <circle cx="22" cy="22" r="12.2" class="bl-weight-groove" stroke="${strokeCol}" />
        <line x1="22" y1="6" x2="22" y2="10" stroke="${strokeCol}" stroke-width="1.3" opacity="0.65" />
        <line x1="22" y1="34" x2="22" y2="38" stroke="${strokeCol}" stroke-width="1.3" opacity="0.65" />
        <line x1="6" y1="22" x2="10" y2="22" stroke="${strokeCol}" stroke-width="1.3" opacity="0.65" />
        <line x1="34" y1="22" x2="38" y2="22" stroke="${strokeCol}" stroke-width="1.3" opacity="0.65" />
        <circle cx="22" cy="22" r="7.2" fill="${strokeCol}" class="bl-weight-gem" />
        <circle cx="22" cy="22" r="3.6" fill="${coreCol}" />
        <circle cx="19.8" cy="19.6" r="1.5" fill="#ffffff" opacity="0.92" />
        ${bolts}
      </svg>
    `;
  }

  // Structural brass cap plug for locked-empty cells & scribe cross for player exclusion
  renderMarkSvg(isLockedPlug) {
    if (isLockedPlug) {
      return `
        <svg viewBox="0 0 32 32" class="bl-plug-svg" title="Blocked: no weight can go here">
          <circle cx="16" cy="16" r="10" class="bl-plug-ring" />
          <line x1="9.5" y1="9.5" x2="22.5" y2="22.5" class="bl-plug-slot" />
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 32 32" class="bl-cross-svg">
        <line x1="11" y1="11" x2="21" y2="21" />
        <line x1="21" y1="11" x2="11" y2="21" />
      </svg>
    `;
  }

  render() {
    const state = this.evaluateState(true);

    const isCooldown = this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000) : 0;

    const maxTiltDeg = 13;
    const tiltY = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, state.netX * 3.0));
    const tiltX = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, -state.netY * 3.0));

    const regionCounts = [0, 0, 0, 0];
    state.realWeights.forEach(w => regionCounts[w.region]++);

    this.container.innerHTML = `
      <div class="game-panel denge-panel ${this.solved ? 'is-solved' : ''}">
        <!-- Top Spirit Level & Pendulum Chamber -->
        ${this.renderPendulumChamber(state)}

        <!-- Region Inlay Legend -->
        <div class="denge-regions-bar">
          ${REGION_PALETTE.map((reg, idx) => `
            <div class="region-chip ${regionCounts[idx] === 1 ? 'done' : ''}">
              <span class="region-dot" style="background:${reg.border}; box-shadow: 0 0 6px ${reg.border};"></span>
              <span>${reg.label}</span>
              <strong>${regionCounts[idx] === 1 ? '1/1' : '0/1'}</strong>
            </div>
          `).join('')}
        </div>

        <!-- 6x6 3D Cedar & Brass Gimbal Stage -->
        <div class="denge-stage">
          <div id="denge-board-3d" class="denge-board-3d ${this.solved ? 'board-locked' : ''}"
               style="transform: perspective(780px) rotateX(${tiltX}deg) rotateY(${tiltY}deg);">
            <div class="denge-grid grid-6x6" oncontextmenu="return false;">
              ${this.renderBoardOverlaySvg(state)}
              ${this.renderGridCells(state)}
            </div>
          </div>
        </div>

        ${this.hintMessage ? `
          <div class="res-hint-banner ${this.hintIsError ? 'error' : 'active'}" id="denge-hint-banner" title="Click to dismiss">
            <span class="res-hint-badge">${this.hintIsError ? ico("ripple") : ico("lantern")}</span>
            <span class="res-hint-text">${this.hintMessage}</span>
          </div>
        ` : ''}

        <div class="game-footer-bar">
          <div class="quick-tip">
            one counterweight in each open inlay. They never touch. Right-click crosses a square out.
          </div>
          <div class="action-btns">
            <button class="btn-secondary" id="denge-undo-btn" ${this.history.length === 0 || this.solved ? 'disabled' : ''}>${ico("undo")}<span>undo</span></button>
            <button class="btn-secondary btn-hint ${isCooldown ? 'cooldown-active' : ''}" id="denge-hint-btn" style="--cooldown-dur: ${remSec > 0 ? remSec : 3}s">
              <span class="btn-cooldown-wipe"></span>
              <span class="btn-text">hint</span>
            </button>
            <button class="btn-secondary" id="denge-reset-btn">${ico("reset")}<span>start fresh</span></button>
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

    this.container.querySelector('#denge-undo-btn')?.addEventListener('click', () => this.undo());
    this.container.querySelector('#denge-hint-btn')?.addEventListener('click', () => this.giveHint());
    this.container.querySelector('#denge-reset-btn')?.addEventListener('click', () => this.resetBoard());
    this.container.querySelector('#denge-hint-banner')?.addEventListener('click', () => {
      this.hintMessage = null;
      this.render();
    });

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector('#denge-hint-btn');
        if (btn) btn.classList.remove('cooldown-active');
      }, remSec * 1000);
    }
  }

  // Smoothly update 3D tilt, spirit bubble, plumb-bob, and tension lines on hover without full DOM rebuild
  updateHoverVisuals() {
    const state = this.evaluateState(true);
    const maxTiltDeg = 13;
    const tiltY = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, state.netX * 3.0));
    const tiltX = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, -state.netY * 3.0));
    const bubbleX = Math.max(-44, Math.min(44, state.netX * 11));
    const bubbleY = Math.max(-9, Math.min(9, state.netY * 2.5));
    const bobX = Math.max(-16, Math.min(16, state.netX * 4.2));
    const bobY = Math.max(-16, Math.min(16, state.netY * 4.2));

    const board3d = this.container.querySelector('#denge-board-3d');
    const bubbleDot = this.container.querySelector('#denge-bubble-dot');
    const plumbLine = this.container.querySelector('#denge-plumb-line');
    const plumbBob = this.container.querySelector('#denge-plumb-bob');
    const guidance = this.container.querySelector('#denge-guidance-text');
    const chamber = this.container.querySelector('#denge-chamber');
    const overlaySvg = this.container.querySelector('#denge-overlay-svg');

    if (board3d) {
      board3d.style.transform = `perspective(780px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    }
    if (bubbleDot) {
      bubbleDot.style.transform = `translate(${bubbleX}px, ${bubbleY}px)`;
    }
    if (plumbLine) {
      plumbLine.setAttribute('x2', String(bobX));
      plumbLine.setAttribute('y2', String(bobY));
    }
    if (plumbBob) {
      plumbBob.style.transform = `translate(${bobX}px, ${bobY}px)`;
    }
    if (chamber) {
      const isEquilibrium = state.netX === 0 && state.netY === 0 && state.weights.length === NUM_WEIGHTS && state.conflicts.size === 0;
      chamber.classList.toggle('is-still', isEquilibrium);
    }
    if (guidance) {
      guidance.innerHTML = this.getBalanceGuidance(
        state.netX,
        state.netY,
        state.weights.length,
        state.conflicts.size > 0,
        Boolean(state.hoverPreview)
      );
    }
    if (overlaySvg) {
      const comX = Math.max(20, Math.min(OVERLAY_SIZE - 20, OVERLAY_MID + state.netX * 16));
      const comY = Math.max(20, Math.min(OVERLAY_SIZE - 20, OVERLAY_MID + state.netY * 16));
      const isCentered = state.netX === 0 && state.netY === 0;
      const linesGroup = overlaySvg.querySelector('#denge-tension-lines');
      const comGroup = overlaySvg.querySelector('#denge-com-svg');
      if (linesGroup) {
        let lines = '';
        for (const w of state.weights) {
          const wx = w.c * CELL_UNITS + CELL_UNITS / 2;
          const wy = w.r * CELL_UNITS + CELL_UNITS / 2;
          const pal = REGION_PALETTE[w.region];
          lines += `<line x1="${wx}" y1="${wy}" x2="${comX}" y2="${comY}" stroke="${pal.gem}" class="bl-tension-line ${w.isHover ? 'is-ghost' : ''} ${isCentered ? 'is-centered' : ''}" />`;
        }
        linesGroup.innerHTML = lines;
      }
      if (comGroup) {
        comGroup.setAttribute('transform', `translate(${comX}, ${comY})`);
        comGroup.classList.toggle('is-centered', isCentered);
      }
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
        const isLockedPlug = this.lockedEmpty[r][c];
        const isLocked = this.lockedEmpty[r][c] || isAnchor;
        const hasConflict = state.conflicts.has(`${r},${c}`);

        const bTop = r === 0 || this.regions[r - 1][c] !== regId ? `2px solid ${pal.border}` : '1px solid rgba(255, 236, 214, 0.08)';
        const bBottom = r === GRID_SIZE - 1 || this.regions[r + 1][c] !== regId ? `2px solid ${pal.border}` : '1px solid rgba(255, 236, 214, 0.08)';
        const bLeft = c === 0 || this.regions[r][c - 1] !== regId ? `2px solid ${pal.border}` : '1px solid rgba(255, 236, 214, 0.08)';
        const bRight = c === GRID_SIZE - 1 || this.regions[r][c + 1] !== regId ? `2px solid ${pal.border}` : '1px solid rgba(255, 236, 214, 0.08)';

        let content = '';
        if (val === 1) {
          content = this.renderWeightSvg(regId, isAnchor, hasConflict, false);
        } else if (val === 2) {
          content = this.renderMarkSvg(isLockedPlug);
        } else {
          content = `<span class="bl-cell-pip" style="--pip-col:${pal.gem}"></span>`;
        }

        const hintItem = this.hintHighlights && this.hintHighlights.find(h => h.r === r && h.c === c);
        const hintClass = hintItem ? (hintItem.isError ? 'cell-hint-error' : 'cell-hint-glow') : '';

        html += `
          <div class="denge-cell ${val === 1 ? 'has-weight' : ''} ${isLocked ? 'is-locked' : ''} ${isLockedPlug ? 'is-blocked' : ''} ${hasConflict ? 'has-conflict' : ''} ${hintClass}"
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
