// GAME 3: REZONANS (Minimalist 6x6 Wave Phase Grid)
// Clean sculptural design matching DENGE:
// - No side/bottom counter boxes, no row/col counter labels.
// - Pure 6x6 grid with '=' and '×' connectors and glowing wave tokens.

import { createRNG } from "./rng.js";
import { sound } from "./audio.js";

const GRID_SIZE = 6;
const HALF = 3; // 3 Blue (+) and 3 Orange (-) in every row and column

export class ResonanceGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;
    this.seed = "";
    this.solution = [];
    this.locked = [];
    this.hClues = [];
    this.vClues = [];
    this.board = [];
    this.hintHighlights = []; // array of {r, c, isError}
    this.hintMessage = null;
    this.hintIsError = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = 0;
    this.lockedRows = new Set();
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
    this.lockedRows.clear();
    this.startTime = Date.now();

    const puz = this.generatePuzzle(seedStr);
    this.solution = puz.solution;
    this.locked = puz.locked;
    this.hClues = puz.hClues;
    this.vClues = puz.vClues;

    this.board = Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) =>
        this.locked[r][c] ? this.solution[r][c] : 0,
      ),
    );

    this.render();
  }

  resetBoard() {
    if (this.solved) return;
    sound.playClick(340);
    this.lockedRows.clear();
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
    this.board = Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) =>
        this.locked[r][c] ? this.solution[r][c] : 0,
      ),
    );
    this.render();
  }

  getValidBalancedLines() {
    const valid = [];
    for (let mask = 0; mask < 1 << GRID_SIZE; mask++) {
      const line = [];
      let sum = 0;
      for (let i = 0; i < GRID_SIZE; i++) {
        const val = mask & (1 << i) ? 1 : -1;
        line.push(val);
        sum += val;
      }
      if (sum !== 0) continue;
      let hasThree = false;
      for (let i = 0; i < GRID_SIZE - 2; i++) {
        if (line[i] === line[i + 1] && line[i + 1] === line[i + 2]) {
          hasThree = true;
          break;
        }
      }
      if (!hasThree) valid.push(line);
    }
    return valid;
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`RESONANCE_V2_${seedStr}`);
    const validLines = this.getValidBalancedLines();

    let fullGrid = null;

    const buildGrid = (rowIdx, currentRows) => {
      if (rowIdx === GRID_SIZE) {
        for (let c = 0; c < GRID_SIZE; c++) {
          let cSum = 0;
          for (let r = 0; r < GRID_SIZE; r++) cSum += currentRows[r][c];
          if (cSum !== 0) return false;
        }
        fullGrid = currentRows.map((r) => [...r]);
        return true;
      }

      const candidates = rng.shuffle(validLines);
      for (const line of candidates) {
        let ok = true;
        for (let c = 0; c < GRID_SIZE; c++) {
          if (
            rowIdx >= 2 &&
            currentRows[rowIdx - 2][c] === currentRows[rowIdx - 1][c] &&
            currentRows[rowIdx - 1][c] === line[c]
          ) {
            ok = false;
            break;
          }
          let plusCnt = line[c] === 1 ? 1 : 0;
          let minusCnt = line[c] === -1 ? 1 : 0;
          for (let rr = 0; rr < rowIdx; rr++) {
            if (currentRows[rr][c] === 1) plusCnt++;
            else minusCnt++;
          }
          if (plusCnt > HALF || minusCnt > HALF) {
            ok = false;
            break;
          }
        }
        if (ok) {
          currentRows.push(line);
          if (buildGrid(rowIdx + 1, currentRows)) return true;
          currentRows.pop();
        }
      }
      return false;
    };

    buildGrid(0, []);

    const locked = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(false),
    );
    const hClues = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE - 1).fill(null),
    );
    const vClues = Array.from({ length: GRID_SIZE - 1 }, () =>
      Array(GRID_SIZE).fill(null),
    );

    const allEdges = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++)
        allEdges.push({ type: "h", r, c });
    }
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) allEdges.push({ type: "v", r, c });
    }

    const shuffledEdges = rng.shuffle(allEdges);
    for (let i = 0; i < 7; i++) {
      const e = shuffledEdges[i];
      if (e.type === "h") {
        hClues[e.r][e.c] =
          fullGrid[e.r][e.c] === fullGrid[e.r][e.c + 1] ? "=" : "x";
      } else {
        vClues[e.r][e.c] =
          fullGrid[e.r][e.c] === fullGrid[e.r + 1][e.c] ? "=" : "x";
      }
    }

    const allCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) allCells.push({ r, c });
    }
    const shuffledCells = rng.shuffle(allCells);
    for (let i = 0; i < 10; i++) {
      locked[shuffledCells[i].r][shuffledCells[i].c] = true;
    }

    let guard = 0;
    while (guard < 20) {
      guard++;
      const solutions = this.countSolutions(
        locked,
        fullGrid,
        hClues,
        vClues,
        2,
      );
      if (solutions.length <= 1) break;

      const alt =
        solutions.find((sol) => !this.gridsEqual(sol, fullGrid)) ||
        solutions[1];
      const diffs = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (alt[r][c] !== fullGrid[r][c] && !locked[r][c]) {
            diffs.push({ r, c });
          }
        }
      }
      if (diffs.length === 0) break;
      const pick = rng.pick(diffs);
      locked[pick.r][pick.c] = true;
    }

    return {
      solution: fullGrid,
      locked,
      hClues,
      vClues,
    };
  }

  gridsEqual(g1, g2) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (g1[r][c] !== g2[r][c]) return false;
      }
    }
    return true;
  }

  countSolutions(locked, solutionGrid, hClues, vClues, limit = 2) {
    const validLines = this.getValidBalancedLines();
    const rowCandidates = Array.from({ length: GRID_SIZE }, (_, r) =>
      validLines.filter((line) => {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (locked[r][c] && line[c] !== solutionGrid[r][c]) return false;
        }
        for (let c = 0; c < GRID_SIZE - 1; c++) {
          if (hClues[r][c] === "=" && line[c] !== line[c + 1]) return false;
          if (hClues[r][c] === "x" && line[c] === line[c + 1]) return false;
        }
        return true;
      }),
    );

    const found = [];
    const current = [];

    const search = (r) => {
      if (found.length >= limit) return;
      if (r === GRID_SIZE) {
        for (let c = 0; c < GRID_SIZE; c++) {
          let s = 0;
          for (let rr = 0; rr < GRID_SIZE; rr++) s += current[rr][c];
          if (s !== 0) return;
        }
        found.push(current.map((row) => [...row]));
        return;
      }

      for (const line of rowCandidates[r]) {
        let ok = true;
        if (r >= 1) {
          for (let c = 0; c < GRID_SIZE; c++) {
            const vc = vClues[r - 1][c];
            if (vc === "=" && current[r - 1][c] !== line[c]) {
              ok = false;
              break;
            }
            if (vc === "x" && current[r - 1][c] === line[c]) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;

        if (r >= 2) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (
              current[r - 2][c] === current[r - 1][c] &&
              current[r - 1][c] === line[c]
            ) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;

        current.push(line);
        search(r + 1);
        current.pop();
        if (found.length >= limit) return;
      }
    };

    search(0);
    return found;
  }

  evaluateState() {
    const conflicts = new Set();
    let filledCount = 0;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] !== 0) filledCount++;
      }
    }

    // Horizontal 3-in-a-row & clues
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 2; c++) {
        const v1 = this.board[r][c],
          v2 = this.board[r][c + 1],
          v3 = this.board[r][c + 2];
        if (v1 !== 0 && v1 === v2 && v2 === v3) {
          conflicts.add(`${r},${c}`);
          conflicts.add(`${r},${c + 1}`);
          conflicts.add(`${r},${c + 2}`);
        }
      }
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const clue = this.hClues[r][c];
        const v1 = this.board[r][c],
          v2 = this.board[r][c + 1];
        if (clue && v1 !== 0 && v2 !== 0) {
          if ((clue === "=" && v1 !== v2) || (clue === "x" && v1 === v2)) {
            conflicts.add(`${r},${c}`);
            conflicts.add(`${r},${c + 1}`);
          }
        }
      }
    }

    // Vertical 3-in-a-row & clues
    for (let c = 0; c < GRID_SIZE; c++) {
      for (let r = 0; r < GRID_SIZE - 2; r++) {
        const v1 = this.board[r][c],
          v2 = this.board[r + 1][c],
          v3 = this.board[r + 2][c];
        if (v1 !== 0 && v1 === v2 && v2 === v3) {
          conflicts.add(`${r},${c}`);
          conflicts.add(`${r + 1},${c}`);
          conflicts.add(`${r + 2},${c}`);
        }
      }
      for (let r = 0; r < GRID_SIZE - 1; r++) {
        const clue = this.vClues[r][c];
        const v1 = this.board[r][c],
          v2 = this.board[r + 1][c];
        if (clue && v1 !== 0 && v2 !== 0) {
          if ((clue === "=" && v1 !== v2) || (clue === "x" && v1 === v2)) {
            conflicts.add(`${r},${c}`);
            conflicts.add(`${r + 1},${c}`);
          }
        }
      }
    }

    const rowStats = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      let plus = 0,
        minus = 0,
        rowHasConflict = false;
      for (let c = 0; c < GRID_SIZE; c++) {
        const v = this.board[r][c];
        if (v === 1) plus++;
        else if (v === -1) minus++;
        if (conflicts.has(`${r},${c}`)) rowHasConflict = true;
      }
      const isOver = plus > HALF || minus > HALF;
      if (isOver) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (
            (plus > HALF && this.board[r][c] === 1) ||
            (minus > HALF && this.board[r][c] === -1)
          ) {
            conflicts.add(`${r},${c}`);
          }
        }
      }
      const isMatched = plus === HALF && minus === HALF && !rowHasConflict;
      rowStats.push({ plus, minus, isMatched, isOver });
    }

    const colStats = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      let plus = 0,
        minus = 0,
        colHasConflict = false;
      for (let r = 0; r < GRID_SIZE; r++) {
        const v = this.board[r][c];
        if (v === 1) plus++;
        else if (v === -1) minus++;
        if (conflicts.has(`${r},${c}`)) colHasConflict = true;
      }
      const isOver = plus > HALF || minus > HALF;
      if (isOver) {
        for (let r = 0; r < GRID_SIZE; r++) {
          if (
            (plus > HALF && this.board[r][c] === 1) ||
            (minus > HALF && this.board[r][c] === -1)
          ) {
            conflicts.add(`${r},${c}`);
          }
        }
      }
      const isMatched = plus === HALF && minus === HALF && !colHasConflict;
      colStats.push({ plus, minus, isMatched, isOver });
    }

    const isWin =
      conflicts.size === 0 &&
      rowStats.every((s) => s.isMatched) &&
      colStats.every((s) => s.isMatched);

    return { conflicts, rowStats, colStats, filledCount, isWin };
  }

  handleCellClick(r, c, isRightClick = false) {
    if (this.solved || this.locked[r][c]) return;

    const cur = this.board[r][c];
    if (isRightClick) {
      this.board[r][c] = cur === 0 ? -1 : cur === -1 ? 1 : 0;
    } else {
      this.board[r][c] = cur === 0 ? 1 : cur === 1 ? -1 : 0;
    }

    this.moves++;
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
    sound.playPhaseTone(this.board[r][c]);

    this.checkWinCondition();
    this.render();
  }

  checkWinCondition() {
    const state = this.evaluateState();

    state.rowStats.forEach((st, idx) => {
      if (st.isMatched && !this.lockedRows.has(idx)) {
        this.lockedRows.add(idx);
        sound.playHarmonicLock(idx);
      } else if (!st.isMatched) {
        this.lockedRows.delete(idx);
      }
    });

    if (state.isWin && !this.solved) {
      this.solved = true;
      sound.playVictory();
      this.render();
      if (this.onWin) {
        setTimeout(() => this.onWin(this.getShareSummary()), 450);
      }
      return true;
    }
    return false;
  }

  checkAfterHint() {
    return this.checkWinCondition();
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    const getPhaseName = (val) => {
      if (val === 1) return 'blue crest (∿+)';
      return 'orange trough (∿−)';
    };
    const getPhasePlural = (val) => {
      if (val === 1) return 'blue crests';
      return 'orange troughs';
    };

    // 1. Mistake correction: If player placed a wrong phase, fix it, highlight error, and explain
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (
          !this.locked[r][c] &&
          this.board[r][c] !== 0 &&
          this.board[r][c] !== this.solution[r][c]
        ) {
          const correctVal = this.solution[r][c];
          this.board[r][c] = correctVal;
          this.hintHighlights = [{ r, c, isError: true }];
          this.hintIsError = true;
          this.hintMessage = `Row ${r + 1}, Col ${c + 1}: Incorrect phase fixed to ${getPhaseName(correctVal)}.`;
          sound.playErrorBuzz();
          this.checkWinCondition();
          this.render();
          return;
        }
      }
    }

    // 2. Line completeness: Look for row or column that already has 3 of one phase
    // 2a. Check rows
    for (let r = 0; r < GRID_SIZE; r++) {
      let plus = 0,
        minus = 0;
      const emptyCols = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === 1) plus++;
        else if (this.board[r][c] === -1) minus++;
        else emptyCols.push(c);
      }
      if ((plus === HALF || minus === HALF) && emptyCols.length > 0) {
        const fullVal = plus === HALF ? 1 : -1;
        const targetVal = -fullVal;
        emptyCols.forEach((c) => {
          this.board[r][c] = targetVal;
        });
        this.hintHighlights = emptyCols.map((c) => ({ r, c, isError: false }));
        this.hintIsError = false;
        this.hintMessage = `Row ${r + 1}: Already has 3 ${getPhasePlural(fullVal)}: filled remaining with ${getPhaseName(targetVal)}.`;
        sound.playHarmonicLock(r);
        this.checkWinCondition();
        this.render();
        return;
      }
    }

    // 2b. Check columns
    for (let c = 0; c < GRID_SIZE; c++) {
      let plus = 0,
        minus = 0;
      const emptyRows = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        if (this.board[r][c] === 1) plus++;
        else if (this.board[r][c] === -1) minus++;
        else emptyRows.push(r);
      }
      if ((plus === HALF || minus === HALF) && emptyRows.length > 0) {
        const fullVal = plus === HALF ? 1 : -1;
        const targetVal = -fullVal;
        emptyRows.forEach((r) => {
          this.board[r][c] = targetVal;
        });
        this.hintHighlights = emptyRows.map((r) => ({ r, c, isError: false }));
        this.hintIsError = false;
        this.hintMessage = `Col ${c + 1}: Already has 3 ${getPhasePlural(fullVal)}: filled remaining with ${getPhaseName(targetVal)}.`;
        sound.playHarmonicLock(c);
        this.checkWinCondition();
        this.render();
        return;
      }
    }

    // 3. Double adjacent identical phases: No 3 identical allowed in a row or column
    // 3a. Horizontal pairs
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const v = this.board[r][c];
        if (v !== 0 && v === this.board[r][c + 1]) {
          const opp = -v;
          if (c + 2 < GRID_SIZE && this.board[r][c + 2] === 0) {
            this.board[r][c + 2] = opp;
            this.hintHighlights = [{ r, c: c + 2, isError: false }];
            this.hintIsError = false;
            this.hintMessage = `Row ${r + 1}, Col ${c + 3}: No 3 identical in a row: placed ${getPhaseName(opp)}.`;
            sound.playHarmonicLock(r);
            this.checkWinCondition();
            this.render();
            return;
          }
          if (c - 1 >= 0 && this.board[r][c - 1] === 0) {
            this.board[r][c - 1] = opp;
            this.hintHighlights = [{ r, c: c - 1, isError: false }];
            this.hintIsError = false;
            this.hintMessage = `Row ${r + 1}, Col ${c}: No 3 identical in a row: placed ${getPhaseName(opp)}.`;
            sound.playHarmonicLock(r);
            this.checkWinCondition();
            this.render();
            return;
          }
        }
      }
    }

    // 3b. Vertical pairs
    for (let c = 0; c < GRID_SIZE; c++) {
      for (let r = 0; r < GRID_SIZE - 1; r++) {
        const v = this.board[r][c];
        if (v !== 0 && v === this.board[r + 1][c]) {
          const opp = -v;
          if (r + 2 < GRID_SIZE && this.board[r + 2][c] === 0) {
            this.board[r + 2][c] = opp;
            this.hintHighlights = [{ r: r + 2, c, isError: false }];
            this.hintIsError = false;
            this.hintMessage = `Row ${r + 3}, Col ${c + 1}: No 3 identical in a column: placed ${getPhaseName(opp)}.`;
            sound.playHarmonicLock(r + 2);
            this.checkWinCondition();
            this.render();
            return;
          }
          if (r - 1 >= 0 && this.board[r - 1][c] === 0) {
            this.board[r - 1][c] = opp;
            this.hintHighlights = [{ r: r - 1, c, isError: false }];
            this.hintIsError = false;
            this.hintMessage = `Row ${r}, Col ${c + 1}: No 3 identical in a column: placed ${getPhaseName(opp)}.`;
            sound.playHarmonicLock(r - 1);
            this.checkWinCondition();
            this.render();
            return;
          }
        }
      }
    }

    // 4. Sandwich constraint: A _ A pattern requires middle cell to be opposite
    // 4a. Horizontal sandwich
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 2; c++) {
        const v = this.board[r][c];
        if (
          v !== 0 &&
          v === this.board[r][c + 2] &&
          this.board[r][c + 1] === 0
        ) {
          const opp = -v;
          this.board[r][c + 1] = opp;
          this.hintHighlights = [{ r, c: c + 1, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 1}, Col ${c + 2}: Between identical phases: placed ${getPhaseName(opp)}.`;
          sound.playHarmonicLock(r);
          this.checkWinCondition();
          this.render();
          return;
        }
      }
    }

    // 4b. Vertical sandwich
    for (let c = 0; c < GRID_SIZE; c++) {
      for (let r = 0; r < GRID_SIZE - 2; r++) {
        const v = this.board[r][c];
        if (
          v !== 0 &&
          v === this.board[r + 2][c] &&
          this.board[r + 1][c] === 0
        ) {
          const opp = -v;
          this.board[r + 1][c] = opp;
          this.hintHighlights = [{ r: r + 1, c, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 2}, Col ${c + 1}: Between identical phases: placed ${getPhaseName(opp)}.`;
          sound.playHarmonicLock(r + 1);
          this.checkWinCondition();
          this.render();
          return;
        }
      }
    }

    // 5. Connectors: Clues '=' (same) and '×' (opposite)
    // 5a. Horizontal clues
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const clue = this.hClues[r][c];
        if (!clue) continue;
        const v1 = this.board[r][c];
        const v2 = this.board[r][c + 1];
        const clueDesc = clue === '=' ? "'=' (same)" : "'×' (opposite)";

        if (v1 !== 0 && v2 === 0) {
          const target = clue === '=' ? v1 : -v1;
          this.board[r][c + 1] = target;
          this.hintHighlights = [{ r, c: c + 1, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 1}, Col ${c + 2}: ${clueDesc} connector: placed ${getPhaseName(target)}.`;
          sound.playHarmonicLock(r);
          this.checkWinCondition();
          this.render();
          return;
        } else if (v2 !== 0 && v1 === 0) {
          const target = clue === '=' ? v2 : -v2;
          this.board[r][c] = target;
          this.hintHighlights = [{ r, c: c + 1, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 1}, Col ${c + 1}: ${clueDesc} connector: placed ${getPhaseName(target)}.`;
          sound.playHarmonicLock(r);
          this.checkWinCondition();
          this.render();
          return;
        }
      }
    }

    // 5b. Vertical clues
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const clue = this.vClues[r][c];
        if (!clue) continue;
        const v1 = this.board[r][c];
        const v2 = this.board[r + 1][c];
        const clueDesc = clue === '=' ? "'=' (same)" : "'×' (opposite)";

        if (v1 !== 0 && v2 === 0) {
          const target = clue === '=' ? v1 : -v1;
          this.board[r + 1][c] = target;
          this.hintHighlights = [{ r: r + 1, c, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 2}, Col ${c + 1}: ${clueDesc} connector: placed ${getPhaseName(target)}.`;
          sound.playHarmonicLock(r + 1);
          this.checkWinCondition();
          this.render();
          return;
        } else if (v2 !== 0 && v1 === 0) {
          const target = clue === '=' ? v2 : -v2;
          this.board[r][c] = target;
          this.hintHighlights = [{ r, c: c + 1, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 1}, Col ${c + 1}: ${clueDesc} connector: placed ${getPhaseName(target)}.`;
          sound.playHarmonicLock(r);
          this.checkWinCondition();
          this.render();
          return;
        }
      }
    }

    // 6. Contextual Reachable Fallback:
    // If no direct rule fired, find an empty cell in the row or column closest to completion
    let bestCell = null;
    let highestPlacedInLine = -1;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!this.locked[r][c] && this.board[r][c] === 0) {
          let rowCount = 0;
          for (let cc = 0; cc < GRID_SIZE; cc++) {
            if (this.board[r][cc] !== 0) rowCount++;
          }
          let colCount = 0;
          for (let rr = 0; rr < GRID_SIZE; rr++) {
            if (this.board[rr][c] !== 0) colCount++;
          }

          const score = Math.max(rowCount, colCount);
          if (score > highestPlacedInLine) {
            highestPlacedInLine = score;
            bestCell = { r, c };
          }
        }
      }
    }

    if (bestCell) {
      const val = this.solution[bestCell.r][bestCell.c];
      this.board[bestCell.r][bestCell.c] = val;
      this.hintHighlights = [{ r: bestCell.r, c: bestCell.c, isError: false }];
      this.hintIsError = false;
      this.hintMessage = `Row ${bestCell.r + 1}, Col ${bestCell.c + 1}: Revealed ${getPhaseName(val)} in the line closest to completion.`;
      sound.playHarmonicLock(bestCell.r);
      this.checkWinCondition();
      this.render();
      return;
    }

    this.checkWinCondition();
    this.render();
  }

  getShareSummary() {
    const elapsedSec = Math.max(
      1,
      Math.round((Date.now() - this.startTime) / 1000),
    );
    const gridLines = [];
    const visualCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      let line = "";
      for (let c = 0; c < GRID_SIZE; c++) {
        line += this.board[r][c] === 1 ? "🟦" : "🟧";
        visualCells.push(this.board[r][c] === 1 ? "blue" : "amber");
      }
      gridLines.push(line);
    }
    return {
      gameName: "RESONANCE",
      subtitle: "6×6 phase matrix balanced",
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: "time",
      stat1Value: `${elapsedSec}s`,
      stat2Label: "moves",
      stat2Value: `${this.moves}`,
      stat3Label: "hints",
      stat3Value: `${this.hintsUsed}`,
      gridCols: 6,
      visualCells,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • resonance (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n${gridLines.join("\n")}`,
    };
  }

  render() {
    const state = this.evaluateState();

    const isCooldown =
      this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown
      ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000)
      : 0;

    this.container.innerHTML = `
      <div class="game-panel resonance-panel ${this.solved ? "is-solved" : ""}">
        <!-- Minimalist Sculptural Header -->
        <div class="denge-regions-bar" style="padding-bottom:6px;">
          <div class="region-chip done" style="border-color:rgba(56,189,248,0.65);">
            <span class="region-dot" style="background:#38bdf8"></span>
            <span>crest phase</span>
            <strong>3 / line</strong>
          </div>
          <div class="region-chip done" style="border-color:rgba(251,146,60,0.65);">
            <span class="region-dot" style="background:#fb923c"></span>
            <span>trough phase</span>
            <strong>3 / line</strong>
          </div>
          <div class="region-chip">
            <span><strong>=</strong> same</span>
            <span>•</span>
            <span><strong>×</strong> opposite</span>
          </div>
          <div class="region-chip ${this.solved ? "done" : state.conflicts.size > 0 ? "over" : ""}">
            <span>${this.solved ? "completed" : state.conflicts.size > 0 ? "rule violation" : `${state.filledCount}/36 cells`}</span>
          </div>
        </div>

        <!-- Pure Sculptural 6x6 Stage -->
        <div class="denge-stage">
          <div class="denge-board-3d ${this.solved ? "board-locked" : ""}">
            <div class="resonance-grid-clean" oncontextmenu="return false;">
              ${this.renderCellsAndClues(state)}
            </div>
          </div>
        </div>

        ${
          this.hintMessage
            ? `
          <div class="res-hint-banner ${this.hintIsError ? "error" : "active"}" id="res-hint-banner" title="Click to dismiss">
            <span class="res-hint-badge">${this.hintIsError ? "!" : "💡"}</span>
            <span class="res-hint-text">${this.hintMessage}</span>
          </div>
        `
            : ""
        }

        <div class="game-footer-bar">
          <div class="quick-tip">
            <strong>3 blue + 3 orange</strong> per line • no <strong>3 identical colors</strong> in a row
          </div>
          <div class="action-btns">
            <button class="btn-secondary btn-hint ${isCooldown ? "cooldown-active" : ""}" id="res-hint-btn" style="--cooldown-dur: ${remSec > 0 ? remSec : 3}s">
              <span class="btn-cooldown-wipe"></span>
              <span class="btn-text">hint</span>
            </button>
            <button class="btn-secondary" id="res-reset-btn">reset</button>
          </div>
        </div>
      </div>
    `;

    this.container.querySelectorAll(".res-cell").forEach((cell) => {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      cell.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleCellClick(r, c, false);
      });
      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.handleCellClick(r, c, true);
      });
    });

    this.container
      .querySelector("#res-hint-btn")
      ?.addEventListener("click", () => this.giveHint());
    this.container
      .querySelector("#res-reset-btn")
      ?.addEventListener("click", () => this.resetBoard());
    this.container
      .querySelector("#res-hint-banner")
      ?.addEventListener("click", () => {
        this.hintMessage = null;
        this.render();
      });

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector("#res-hint-btn");
        if (btn) btn.classList.remove("cooldown-active");
      }, remSec * 1000);
    }
  }

  renderCellsAndClues(state) {
    let html = "";
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const val = this.board[r][c];
        const isLocked = this.locked[r][c];
        const hasConflict = state.conflicts.has(`${r},${c}`);
        const rowMatched = state.rowStats[r].isMatched;
        const colMatched = state.colStats[c].isMatched;

        let inner = "";
        if (val === 1) {
          inner = `
            <div class="res-disc plus ${isLocked ? "locked" : ""}">
              <svg viewBox="0 0 32 18" class="wave-svg">
                <path d="M 3 13 Q 16 0 29 13" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
              </svg>
            </div>
          `;
        } else if (val === -1) {
          inner = `
            <div class="res-disc minus ${isLocked ? "locked" : ""}">
              <svg viewBox="0 0 32 18" class="wave-svg">
                <path d="M 3 5 Q 16 18 29 5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
              </svg>
            </div>
          `;
        }

        let hClueHtml = "";
        if (c < GRID_SIZE - 1 && this.hClues[r][c]) {
          const sym = this.hClues[r][c] === "=" ? "=" : "×";
          hClueHtml = `<div class="edge-clue h-clue ${this.hClues[r][c] === "=" ? "eq" : "opp"}">${sym}</div>`;
        }

        let vClueHtml = "";
        if (r < GRID_SIZE - 1 && this.vClues[r][c]) {
          const sym = this.vClues[r][c] === "=" ? "=" : "×";
          vClueHtml = `<div class="edge-clue v-clue ${this.vClues[r][c] === "=" ? "eq" : "opp"}">${sym}</div>`;
        }

        const hintItem =
          this.hintHighlights &&
          this.hintHighlights.find((h) => h.r === r && h.c === c);
        const hintClass = hintItem
          ? hintItem.isError
            ? "cell-hint-error"
            : "cell-hint-glow"
          : "";

        html += `
          <div class="res-cell ${val === 1 ? "is-plus" : val === -1 ? "is-minus" : ""} ${isLocked ? "is-locked" : ""} ${hasConflict ? "cell-conflict" : ""} ${rowMatched || colMatched ? "in-matched-line" : ""} ${hintClass}"
               data-r="${r}" data-c="${c}">
            ${inner}
            ${hClueHtml}
            ${vClueHtml}
          </div>
        `;
      }
    }
    return html;
  }
}
