// INSTRUMENT 03: RESONANCE (Wave & Phase)
// Align crests and troughs until conflicting air currents cancel out.
// - 6x6 grid of wave tiles; every row and column needs 3 crests + 3 troughs.
// - Each row/column has a little oscilloscope that calms as you fill it and goes
//   perfectly flat once the line is balanced.
// - '=' and '×' connectors say whether two neighbouring tiles share a phase.

import { createRNG } from "./rng.js";
import { sound } from "./audio.js";
import { ico } from "./icons.js";

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
    this.history = []; // board snapshots for undo
    this.lastChanged = null;
    this.inputMode = "cycle"; // "cycle" | "crest" | "trough"
  }

  pushHistory() {
    this.history.push(this.board.map((row) => [...row]));
    if (this.history.length > 80) this.history.shift();
  }

  undo() {
    if (this.solved || this.history.length === 0) return;
    sound.playClick(380);
    this.board = this.history.pop();
    this.hintHighlights = [];
    this.hintMessage = null;
    this.hintIsError = false;
    this.checkWinCondition();
    this.render();
  }

  loadSeed(seedStr) {
    this.history = [];
    this.lastChanged = null;
    this.inputMode = "cycle";
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
    this.history = [];
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

    this.pushHistory();
    this.lastChanged = { r, c };
    const cur = this.board[r][c];
    if (isRightClick) {
      this.board[r][c] = cur === 0 ? -1 : cur === -1 ? 1 : 0;
    } else if (this.inputMode === "crest") {
      this.board[r][c] = cur === 1 ? 0 : 1;
    } else if (this.inputMode === "trough") {
      this.board[r][c] = cur === -1 ? 0 : -1;
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

  // Click a row or column barometer meter: if 3 of one phase are already placed,
  // gently fill the remaining empty cells in that line with the opposite phase.
  handleMeterClick(type, idx) {
    if (this.solved) return;
    let plus = 0;
    let minus = 0;
    const empties = [];

    if (type === "row") {
      for (let c = 0; c < GRID_SIZE; c++) {
        const v = this.board[idx][c];
        if (v === 1) plus++;
        else if (v === -1) minus++;
        else if (!this.locked[idx][c]) empties.push({ r: idx, c });
      }
    } else {
      for (let r = 0; r < GRID_SIZE; r++) {
        const v = this.board[r][idx];
        if (v === 1) plus++;
        else if (v === -1) minus++;
        else if (!this.locked[r][idx]) empties.push({ r, c: idx });
      }
    }

    if (empties.length === 0) return;
    if (plus !== HALF && minus !== HALF) {
      sound.playClick(300, 0.03);
      return;
    }

    const fillVal = plus === HALF ? -1 : 1;
    this.pushHistory();
    empties.forEach(({ r, c }) => {
      this.board[r][c] = fillVal;
    });
    this.lastChanged = empties[empties.length - 1];
    this.moves++;
    this.hintHighlights = empties.map(({ r, c }) => ({ r, c, isError: false }));
    this.hintIsError = false;
    this.hintMessage = `${type === "row" ? "Row" : "Column"} ${idx + 1} balanced with ${fillVal === 1 ? "sky crests" : "amber troughs"}.`;
    sound.playHarmonicLock(idx);
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
    this.pushHistory();

    const getPhaseName = (val) => {
      if (val === 1) return 'blue crest';
      return 'amber trough';
    };
    const getPhasePlural = (val) => {
      if (val === 1) return 'blue crests';
      return 'amber troughs';
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
          this.hintMessage = `Row ${r + 1}, Col ${c + 1}: this one belongs to ${getPhaseName(correctVal)}.`;
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
        this.hintMessage = `Row ${r + 1}: already has 3 ${getPhasePlural(fullVal)}, so the rest settle as ${getPhaseName(targetVal)}.`;
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
        this.hintMessage = `Col ${c + 1}: already has 3 ${getPhasePlural(fullVal)}, so the rest settle as ${getPhaseName(targetVal)}.`;
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
            this.hintMessage = `Row ${r + 1}, Col ${c + 3}: three alike cannot sit side by side in a row: placed ${getPhaseName(opp)}.`;
            sound.playHarmonicLock(r);
            this.checkWinCondition();
            this.render();
            return;
          }
          if (c - 1 >= 0 && this.board[r][c - 1] === 0) {
            this.board[r][c - 1] = opp;
            this.hintHighlights = [{ r, c: c - 1, isError: false }];
            this.hintIsError = false;
            this.hintMessage = `Row ${r + 1}, Col ${c}: three alike cannot sit side by side in a row: placed ${getPhaseName(opp)}.`;
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
            this.hintMessage = `Row ${r + 3}, Col ${c + 1}: three alike cannot sit side by side in a column: placed ${getPhaseName(opp)}.`;
            sound.playHarmonicLock(r + 2);
            this.checkWinCondition();
            this.render();
            return;
          }
          if (r - 1 >= 0 && this.board[r - 1][c] === 0) {
            this.board[r - 1][c] = opp;
            this.hintHighlights = [{ r: r - 1, c, isError: false }];
            this.hintIsError = false;
            this.hintMessage = `Row ${r}, Col ${c + 1}: three alike cannot sit side by side in a column: placed ${getPhaseName(opp)}.`;
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
          this.hintMessage = `Row ${r + 1}, Col ${c + 2}: between two alike, a different one belongs: placed ${getPhaseName(opp)}.`;
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
          this.hintMessage = `Row ${r + 2}, Col ${c + 1}: between two alike, a different one belongs: placed ${getPhaseName(opp)}.`;
          sound.playHarmonicLock(r + 1);
          this.checkWinCondition();
          this.render();
          return;
        }
      }
    }

    // 5. Links: '=' (same phase) and '×' (opposite phase)
    // 5a. Horizontal clues
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const clue = this.hClues[r][c];
        if (!clue) continue;
        const v1 = this.board[r][c];
        const v2 = this.board[r][c + 1];
        const clueDesc = clue === '=' ? "a same-phase link" : "an opposite-phase link";

        if (v1 !== 0 && v2 === 0) {
          const target = clue === '=' ? v1 : -v1;
          this.board[r][c + 1] = target;
          this.hintHighlights = [{ r, c: c + 1, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 1}, Col ${c + 2}: ${clueDesc} places a ${getPhaseName(target)}.`;
          sound.playHarmonicLock(r);
          this.checkWinCondition();
          this.render();
          return;
        } else if (v2 !== 0 && v1 === 0) {
          const target = clue === '=' ? v2 : -v2;
          this.board[r][c] = target;
          this.hintHighlights = [{ r, c, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 1}, Col ${c + 1}: ${clueDesc} places a ${getPhaseName(target)}.`;
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
        const clueDesc = clue === '=' ? "a same-phase link" : "an opposite-phase link";

        if (v1 !== 0 && v2 === 0) {
          const target = clue === '=' ? v1 : -v1;
          this.board[r + 1][c] = target;
          this.hintHighlights = [{ r: r + 1, c, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 2}, Col ${c + 1}: ${clueDesc} places a ${getPhaseName(target)}.`;
          sound.playHarmonicLock(r + 1);
          this.checkWinCondition();
          this.render();
          return;
        } else if (v2 !== 0 && v1 === 0) {
          const target = clue === '=' ? v2 : -v2;
          this.board[r][c] = target;
          this.hintHighlights = [{ r, c, isError: false }];
          this.hintIsError = false;
          this.hintMessage = `Row ${r + 1}, Col ${c + 1}: ${clueDesc} places a ${getPhaseName(target)}.`;
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
      this.hintMessage = `Row ${bestCell.r + 1}, Col ${bestCell.c + 1}: a little light on this one: ${getPhaseName(val)}.`;
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


  // ------------------------------------------------------------------ rendering

  // Top Atmospheric Interference Chamber:
  // Shows the Sky Crest current (cyan), the Hearth Trough current (amber), and their
  // resultant superposition wave (gold). As lines settle (0 -> 12), the two currents
  // slide into 180-degree phase opposition and the resultant wave flattens into stillness.
  interferenceChamberSvg(state, settled, totalLines) {
    const W = 360;
    const H = 44;
    const mid = 22;
    const ratio = settled / totalLines; // 0..1
    const hasConflict = state.conflicts.size > 0;

    // Phase offset between crest wave and trough wave:
    // starts out of tune (0.9 rad) and locks to exact pi (destructive cancellation) when solved
    const phaseShift = 0.9 + ratio * (Math.PI - 0.9);
    const waveAmp = 11;
    const sumAmp = this.solved ? 0 : Math.max(0.8, 13 * (1 - ratio * 0.92));

    const skyPts = [];
    const hearthPts = [];
    const sumPts = [];

    for (let x = 0; x <= W; x += 3) {
      const t = (x / W) * Math.PI * 6;
      const ySky = mid - waveAmp * Math.sin(t);
      const yHearth = mid - waveAmp * Math.sin(t + phaseShift);
      skyPts.push(`${x},${ySky.toFixed(1)}`);
      hearthPts.push(`${x},${yHearth.toFixed(1)}`);

      if (hasConflict && !this.solved) {
        const jag = Math.sin(t * 2.3) * 8 + ((x / 3) % 2 === 0 ? -3.5 : 3.5);
        sumPts.push(`${x},${(mid + jag).toFixed(1)}`);
      } else {
        const ySum = mid - sumAmp * Math.sin(t + phaseShift * 0.5);
        sumPts.push(`${x},${ySum.toFixed(1)}`);
      }
    }

    // 6 column harmonic ticks aligned with the 6 columns
    let ticks = "";
    for (let c = 0; c < GRID_SIZE; c++) {
      const x = ((c + 0.5) / GRID_SIZE) * W;
      const colDone = state.colStats[c].isMatched;
      ticks += `<line x1="${x.toFixed(1)}" y1="4" x2="${x.toFixed(1)}" y2="${H - 4}" class="rz-chamber-tick ${colDone ? "is-settled" : ""}" />`;
      if (colDone) {
        ticks += `<circle cx="${x.toFixed(1)}" cy="${mid}" r="2.3" class="rz-chamber-node" />`;
      }
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" class="rz-chamber-svg ${this.solved ? "is-still" : hasConflict ? "is-clash" : ""}" preserveAspectRatio="none">
        <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" class="rz-chamber-axis" />
        ${ticks}
        <polyline points="${skyPts.join(" ")}" class="rz-wave-sky" />
        <polyline points="${hearthPts.join(" ")}" class="rz-wave-hearth" />
        <polyline points="${sumPts.join(" ")}" class="rz-wave-sum" />
      </svg>
    `;
  }

  // A tiny oscilloscope + phase pip meter for one row/column:
  //  - unsettled  -> a gentle wave whose height shrinks with every cell you fill
  //  - over quota -> a jagged coral wave (too many crests or too many troughs)
  //  - balanced   -> a perfectly flat, glowing line with end-nodes
  scopeSvg(stat) {
    const filled = stat.plus + stat.minus;
    const empty = GRID_SIZE - filled;
    let cls = "unsettled";
    let d = "";
    const W = 56;
    const mid = 8;

    if (stat.isMatched) {
      cls = "settled";
      d = `M 3 ${mid} L ${W - 3} ${mid}`;
    } else if (stat.isOver) {
      cls = "over";
      const pts = [];
      for (let x = 2; x <= W - 2; x += 4) pts.push(`${x} ${mid + ((x / 4) % 2 === 0 ? -5.5 : 5.5)}`);
      d = "M " + pts.join(" L ");
    } else {
      const amp = 1.3 + 5.2 * (empty / GRID_SIZE);
      const pts = [];
      for (let x = 2; x <= W - 2; x += 2) {
        pts.push(`${x} ${(mid + amp * Math.sin(((x - 2) / (W - 4)) * Math.PI * 4)).toFixed(2)}`);
      }
      d = "M " + pts.join(" L ");
    }

    const nodes = stat.isMatched
      ? `<circle cx="3" cy="${mid}" r="1.8" class="rz-scope-dot"/><circle cx="${W - 3}" cy="${mid}" r="1.8" class="rz-scope-dot"/>`
      : "";

    return `<svg viewBox="0 0 ${W} 16" class="rz-scope ${cls}" preserveAspectRatio="none"><path d="${d}" />${nodes}</svg>`;
  }

  // 3 Crest pips (sky blue) + 3 Trough pips (warm amber) for each row/col meter
  meterPipsHtml(stat) {
    let crestPips = "";
    for (let i = 0; i < HALF; i++) {
      const on = i < stat.plus;
      const over = stat.plus > HALF;
      crestPips += `<i class="rz-pip crest ${on ? (over ? "over" : "on") : ""}"></i>`;
    }
    let troughPips = "";
    for (let i = 0; i < HALF; i++) {
      const on = i < stat.minus;
      const over = stat.minus > HALF;
      troughPips += `<i class="rz-pip trough ${on ? (over ? "over" : "on") : ""}"></i>`;
    }
    return `<div class="rz-meter-pips"><span class="rz-pip-group">${crestPips}</span><span class="rz-pip-group">${troughPips}</span></div>`;
  }

  // Empty resonator dial SVG
  restGlyph(isLocked) {
    return `
      <svg viewBox="0 0 40 40" class="rz-empty-svg">
        <circle cx="20" cy="20" r="13.5" class="rz-dial-ring" />
        <line x1="10" y1="20" x2="30" y2="20" class="rz-dial-horizon" />
        <circle cx="20" cy="20" r="1.8" class="rz-dial-pivot" />
      </svg>
    `;
  }

  // Sculptural Crest (+1) and Trough (-1) wave medallions
  waveGlyph(val, isLocked) {
    const rivets = isLocked
      ? `<circle cx="6.5" cy="6.5" r="1.3" class="rz-rivet"/><circle cx="33.5" cy="6.5" r="1.3" class="rz-rivet"/><circle cx="6.5" cy="33.5" r="1.3" class="rz-rivet"/><circle cx="33.5" cy="33.5" r="1.3" class="rz-rivet"/>`
      : "";

    if (val === 1) {
      // Crest: upward wind arch + harmonic echo curve + glowing zenith pearl
      return `
        <svg viewBox="0 0 40 40" class="rz-wave">
          <circle cx="20" cy="20" r="16" class="rz-medallion-halo" />
          <circle cx="20" cy="20" r="15.2" class="rz-medallion-ring" />
          <line x1="7" y1="25" x2="33" y2="25" class="rz-wave-horizon" />
          <path d="M 8 27 C 14 14, 26 14, 32 27" class="rz-wave-echo" />
          <path d="M 6 25.5 C 12.5 8.5, 27.5 8.5, 34 25.5" class="rz-wave-main" />
          <circle cx="20" cy="11.2" r="3.4" class="rz-wave-node-halo" />
          <circle cx="20" cy="11.2" r="2.1" class="rz-wave-node" />
          <circle cx="19.3" cy="10.5" r="0.75" class="rz-wave-spark" />
          ${rivets}
        </svg>
      `;
    }

    // Trough: downward valley curve + harmonic echo curve + glowing nadir ember
    return `
      <svg viewBox="0 0 40 40" class="rz-wave">
        <circle cx="20" cy="20" r="16" class="rz-medallion-halo" />
        <circle cx="20" cy="20" r="15.2" class="rz-medallion-ring" />
        <line x1="7" y1="15" x2="33" y2="15" class="rz-wave-horizon" />
        <path d="M 8 13 C 14 26, 26 26, 32 13" class="rz-wave-echo" />
        <path d="M 6 14.5 C 12.5 31.5, 27.5 31.5, 34 14.5" class="rz-wave-main" />
        <circle cx="20" cy="28.8" r="3.4" class="rz-wave-node-halo" />
        <circle cx="20" cy="28.8" r="2.1" class="rz-wave-node" />
        <circle cx="19.3" cy="28.1" r="0.75" class="rz-wave-spark" />
        ${rivets}
      </svg>
    `;
  }

  // Brass phase coupler between two adjacent cells ('=' same phase, '×' opposite phase)
  clueBadgeHtml(axis, clue, v1, v2) {
    const eq = clue === "=";
    let stateCls = "";
    if (v1 !== 0 && v2 !== 0) {
      const ok = (eq && v1 === v2) || (!eq && v1 !== v2);
      stateCls = ok ? "is-ok" : "is-bad";
    }
    const glyph = eq
      ? `<svg viewBox="0 0 14 14" class="rz-clue-svg"><line x1="3.5" y1="5.2" x2="10.5" y2="5.2"/><line x1="3.5" y1="8.8" x2="10.5" y2="8.8"/></svg>`
      : `<svg viewBox="0 0 14 14" class="rz-clue-svg"><line x1="4" y1="4" x2="10" y2="10"/><line x1="10" y1="4" x2="4" y2="10"/></svg>`;
    const title = eq ? "Same phase" : "Opposite phase";
    return `<div class="rz-clue ${axis} ${eq ? "eq" : "opp"} ${stateCls}" title="${title}">${glyph}</div>`;
  }

  render() {
    const state = this.evaluateState();

    const isCooldown =
      this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown
      ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000)
      : 0;

    const settled =
      state.rowStats.filter((s) => s.isMatched).length +
      state.colStats.filter((s) => s.isMatched).length;
    const totalLines = GRID_SIZE * 2;
    const hasConflict = state.conflicts.size > 0;

    let gridHtml = "";
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        gridHtml += this.renderCell(r, c, state);
      }
    }

    this.container.innerHTML = `
      <div class="game-panel resonance-panel ${this.solved ? "is-solved" : ""}">
        <!-- Atmospheric Wave Interference Chamber -->
        <div class="rz-header">
          <div class="rz-chamber ${this.solved ? "is-still" : hasConflict ? "is-clash" : ""}">
            <div class="rz-chamber-top">
              <span class="rz-chamber-title">The restless air</span>
              <span class="rz-stillness-count">${settled}/${totalLines} lines calm</span>
            </div>
            ${this.interferenceChamberSvg(state, settled, totalLines)}
            <div class="rz-chamber-caption ${this.solved ? "done" : hasConflict ? "over" : ""}">
              ${
                this.solved
                  ? "The currents cancel out and the air hums in stillness"
                  : hasConflict
                    ? "Two air currents clash: look for the rose-colored tiles"
                    : "Align crests and troughs until the golden wave settles flat"
              }
            </div>
          </div>
        </div>

        <div class="rz-stage">
          <div class="rz-board ${this.solved ? "is-still" : ""}" oncontextmenu="return false;">
            ${gridHtml}
          </div>
        </div>

        ${
          this.hintMessage
            ? `
          <div class="res-hint-banner ${this.hintIsError ? "error" : "active"}" id="res-hint-banner" title="Click to dismiss">
            <span class="res-hint-badge">${this.hintIsError ? ico("ripple") : ico("lantern")}</span>
            <span class="res-hint-text">${this.hintMessage}</span>
          </div>
        `
            : ""
        }

        <div class="game-footer-bar">
          <div class="quick-tip">
            <strong>3 crests and 3 troughs</strong> in every row and column. Never <strong>3 alike</strong> in a row. ${ico("same")} same wave, ${ico("opposite")} opposite wave.
          </div>
          <div class="action-btns action-btns-split">
            <div class="sonar-mode-pill rz-mode-pill" title="What a tap places">
              <button class="sonar-mode-btn ${this.inputMode === "cycle" ? "active" : ""}" data-mode="cycle" title="Cycle through empty, crest and trough">
                cycle
              </button>
              <button class="sonar-mode-btn ${this.inputMode === "crest" ? "active" : ""}" data-mode="crest" title="Place crests">
                <svg viewBox="0 0 14 10" class="mode-icon"><path d="M 1 8 C 4 1.5, 10 1.5, 13 8" fill="none" stroke="#9bd1e5" stroke-width="2" stroke-linecap="round"/></svg>
                crest
              </button>
              <button class="sonar-mode-btn ${this.inputMode === "trough" ? "active" : ""}" data-mode="trough" title="Place troughs">
                <svg viewBox="0 0 14 10" class="mode-icon"><path d="M 1 2 C 4 8.5, 10 8.5, 13 2" fill="none" stroke="#ffb870" stroke-width="2" stroke-linecap="round"/></svg>
                trough
              </button>
            </div>
            <button class="btn-secondary btn-push-right" id="res-undo-btn" ${this.history.length === 0 || this.solved ? "disabled" : ""}>${ico("undo")}<span>undo</span></button>
            <button class="btn-secondary btn-hint ${isCooldown ? "cooldown-active" : ""}" id="res-hint-btn" style="--cooldown-dur: ${remSec > 0 ? remSec : 3}s">
              <span class="btn-cooldown-wipe"></span>
              <span class="btn-text">hint</span>
            </button>
            <button class="btn-secondary" id="res-reset-btn">${ico("reset")}<span>start fresh</span></button>
          </div>
        </div>
      </div>
    `;

    this.lastChanged = null;

    this.container.querySelectorAll(".rz-cell").forEach((cell) => {
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

    this.container.querySelectorAll(".rz-meter").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.handleMeterClick(btn.dataset.meterType, Number(btn.dataset.meterIdx));
      });
    });

    this.container.querySelectorAll(".rz-mode-pill .sonar-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.inputMode = btn.dataset.mode;
        sound.playClick(460, 0.03);
        this.render();
      });
    });

    this.container
      .querySelector("#res-hint-btn")
      ?.addEventListener("click", () => this.giveHint());
    this.container
      .querySelector("#res-undo-btn")
      ?.addEventListener("click", () => this.undo());
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

  renderCell(r, c, state) {
    const val = this.board[r][c];
    const isLocked = this.locked[r][c];
    const hasConflict = state.conflicts.has(`${r},${c}`);
    const lineSettled = state.rowStats[r].isMatched || state.colStats[c].isMatched;
    const popped = this.lastChanged && this.lastChanged.r === r && this.lastChanged.c === c;

    const inner =
      val === 0
        ? this.restGlyph(isLocked)
        : this.waveGlyph(val, isLocked);

    let hClueHtml = "";
    if (c < GRID_SIZE - 1 && this.hClues[r][c]) {
      hClueHtml = this.clueBadgeHtml("h", this.hClues[r][c], val, this.board[r][c + 1]);
    }
    let vClueHtml = "";
    if (r < GRID_SIZE - 1 && this.vClues[r][c]) {
      vClueHtml = this.clueBadgeHtml("v", this.vClues[r][c], val, this.board[r + 1][c]);
    }

    const hintItem = this.hintHighlights && this.hintHighlights.find((h) => h.r === r && h.c === c);
    const hintClass = hintItem ? (hintItem.isError ? "cell-hint-error" : "cell-hint-glow") : "";

    return `
      <div class="rz-cell ${val === 1 ? "is-crest" : val === -1 ? "is-trough" : "is-empty"} ${isLocked ? "is-locked" : ""} ${hasConflict ? "is-clash" : ""} ${lineSettled ? "in-settled-line" : ""} ${popped ? "just-changed" : ""} ${hintClass}"
           data-r="${r}" data-c="${c}" title="${isLocked ? "Fixed harmonic anchor" : "Tap to tune wave phase"}">
        ${inner}
        ${hClueHtml}
        ${vClueHtml}
      </div>
    `;
  }
}
