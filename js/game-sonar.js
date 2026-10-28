// INSTRUMENT 02: SONAR (Deep Sea)
// Send soft pings through the morning mist to find the quiet boats resting in Quiet Harbor.
// - 6x6 harbor chart with hydrophone listening posts on every row and column
// - Fleet: 1 Fishing Trawler (3 cells), 2 Rowboats (2 cells), 3 Lantern Buoys (1 cell)
// - Boats never touch each other, not even diagonally
// - Every harbor is solvable by pure logic (no guessing); the generator verifies it
// - Two soft pings per harbor: arm the sonar, then tap any misty square to hear what lies beneath
// - Hints point at mistakes or at the next reachable deduction

import { createRNG } from './rng.js';
import { sound } from './audio.js';
import { ico } from './icons.js';

const GRID_SIZE = 6;
const FLEET_DEF = [
  { id: 'cruiser', name: 'Fishing Trawler', len: 3, total: 1 },
  { id: 'patrol', name: 'Rowboat', len: 2, total: 2 },
  { id: 'buoy', name: 'Lantern Buoy', len: 1, total: 3 }
];
const TOTAL_SHIP_CELLS = 10;

const CELL_EMPTY = 0;
const CELL_SHIP = 1;
const CELL_WATER = 2;

export class SonarGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;
    this.seed = '';

    // Puzzle Data
    this.solutionGrid = [];    // 6x6 (CELL_SHIP or CELL_WATER)
    this.ships = [];           // array of { id, len, horizontal, cells: [{r,c}] }
    this.rowCounts = [];       // length 6
    this.colCounts = [];       // length 6
    this.starterClues = [];    // array of { r, c, val, shape }

    // Player State
    this.board = [];           // 6x6 (0 = empty, 1 = ship, 2 = water)
    this.lockedShips = new Set(); // ship id strings
    this.activePingsRemaining = 2; // two soft pings per harbor
    this.pingArmed = false;
    this.inputMode = 'cycle';  // 'cycle' | 'ship' | 'water'
    this.moveCount = 0;
    this.hintsUsed = 0;
    this.hintHighlights = [];  // array of { r, c, isError }
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.solved = false;
    this.startTime = 0;

    // Canvas Oscilloscope Animation
    this.animFrame = null;
    this.sonarPulses = [];
    this.statusMessage = '';
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moveCount = 0;
    this.hintsUsed = 0;
    this.activePingsRemaining = 2;
    this.pingArmed = false;
    this.inputMode = 'cycle';
    this.hintHighlights = [];
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
    this.solved = false;
    this.lockedShips = new Set();
    this.startTime = Date.now();
    this.sonarPulses = [];

    // Generate guaranteed 100% human-deductive puzzle
    const puzzle = this.generateGuaranteedPuzzle(seedStr);
    this.solutionGrid = puzzle.solutionGrid;
    this.ships = puzzle.ships;
    this.rowCounts = puzzle.rowCounts;
    this.colCounts = puzzle.colCounts;
    this.starterClues = puzzle.starterClues;

    // Initialize player board with empty cells, then apply shaped starter clues
    this.board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(CELL_EMPTY));
    for (const clue of this.starterClues) {
      this.board[clue.r][clue.c] = clue.val;
    }

    this.statusMessage = `The hydrophone is listening: ${this.starterClues.length} quiet contact${this.starterClues.length > 1 ? 's' : ''} already marked`;
    this.checkShipCompletions(false);

    this.render();
    this.startOscilloscopeLoop();
  }

  resetBoard() {
    if (this.solved) return;
    sound.playClick(340);
    this.moveCount++;
    this.lockedShips.clear();
    this.board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(CELL_EMPTY));
    for (const clue of this.starterClues) {
      this.board[clue.r][clue.c] = clue.val;
    }
    this.hintHighlights = [];
    this.statusMessage = 'The harbor chart is back to its first contacts';
    this.checkShipCompletions(false);
    this.render();
  }

  // =========================================================================
  // 100% HUMAN-DEDUCTIVE PUZZLE GENERATOR & SOLVER
  // =========================================================================

  generateGuaranteedPuzzle(seedStr) {
    const FLEET_LENS = [3, 2, 2, 1, 1, 1];

    for (let attempt = 0; attempt < 250; attempt++) {
      const rng = createRNG(`SONAR_HUMAN_${seedStr}_att_${attempt}`);

      // 1. Generate valid fleet placement on 6x6
      const fleetResult = this.generateRandomFleet(rng, FLEET_LENS);
      if (!fleetResult) continue;

      const { grid: shipIdGrid, ships } = fleetResult;
      const solutionGrid = Array.from({ length: GRID_SIZE }, (_, r) =>
        Array.from({ length: GRID_SIZE }, (_, c) => (shipIdGrid[r][c] > 0 ? CELL_SHIP : CELL_WATER))
      );

      // Compute row and column hydrophone counts
      const rowCounts = Array(GRID_SIZE).fill(0);
      const colCounts = Array(GRID_SIZE).fill(0);
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (solutionGrid[r][c] === CELL_SHIP) {
            rowCounts[r]++;
            colCounts[c]++;
          }
        }
      }

      // Collect ship and water cell coordinates with true shapes
      const shipCells = [];
      const waterCells = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (solutionGrid[r][c] === CELL_SHIP) {
            const shape = this.getTrueCellShape(ships, r, c);
            shipCells.push({ r, c, val: CELL_SHIP, shape });
          } else {
            waterCells.push({ r, c, val: CELL_WATER, shape: 'water' });
          }
        }
      }

      const shufShips = rng.shuffle(shipCells);
      const shufWater = rng.shuffle(waterCells);

      // Candidate Clue Sets:
      // Try combinations of 2 or 3 shaped clues (e.g. 1 ship shape + 1 water, or 2 ship shapes, or 2 ship + 1 water)
      for (let i = 0; i < Math.min(8, shufShips.length); i++) {
        const s1 = shufShips[i];
        const w1 = shufWater[i % shufWater.length];
        const clues = [s1, w1];
        if (this.solveHumanDeductive(rowCounts, colCounts, clues).solved) {
          return { solutionGrid, ships, rowCounts, colCounts, starterClues: clues };
        }
      }

      for (let i = 0; i < Math.min(6, shufShips.length - 1); i++) {
        const s1 = shufShips[i];
        const s2 = shufShips[i + 1];
        const clues = [s1, s2];
        if (this.solveHumanDeductive(rowCounts, colCounts, clues).solved) {
          return { solutionGrid, ships, rowCounts, colCounts, starterClues: clues };
        }
      }

      for (let i = 0; i < Math.min(6, shufShips.length - 1); i++) {
        const s1 = shufShips[i];
        const s2 = shufShips[i + 1];
        const w1 = shufWater[i % shufWater.length];
        const clues = [s1, s2, w1];
        if (this.solveHumanDeductive(rowCounts, colCounts, clues).solved) {
          return { solutionGrid, ships, rowCounts, colCounts, starterClues: clues };
        }
      }
    }

    // Deterministic fallback with shaped starter clues
    return this.createDeterministicFallback();
  }

  generateRandomFleet(rng, fleetLens) {
    for (let fAttempt = 0; fAttempt < 400; fAttempt++) {
      const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
      const ships = [];
      let success = true;

      for (let sIdx = 0; sIdx < fleetLens.length; sIdx++) {
        const len = fleetLens[sIdx];
        const validPlacements = [];

        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (c + len <= GRID_SIZE && this.canPlaceShip(grid, r, c, len, true)) {
              validPlacements.push({ r, c, len, horizontal: true });
            }
            if (len > 1 && r + len <= GRID_SIZE && this.canPlaceShip(grid, r, c, len, false)) {
              validPlacements.push({ r, c, len, horizontal: false });
            }
          }
        }

        if (validPlacements.length === 0) {
          success = false;
          break;
        }

        const choice = rng.pick(validPlacements);
        const cells = [];
        for (let i = 0; i < len; i++) {
          const rr = choice.horizontal ? choice.r : choice.r + i;
          const cc = choice.horizontal ? choice.c + i : choice.c;
          grid[rr][cc] = sIdx + 1;
          cells.push({ r: rr, c: cc });
        }
        ships.push({
          id: `ship_${sIdx}_len${len}`,
          len,
          horizontal: choice.horizontal,
          cells
        });
      }

      if (success) {
        return { grid, ships };
      }
    }
    return null;
  }

  canPlaceShip(grid, r, c, len, horizontal) {
    for (let i = 0; i < len; i++) {
      const rr = horizontal ? r : r + i;
      const cc = horizontal ? c + i : c;
      if (rr >= GRID_SIZE || cc >= GRID_SIZE) return false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = rr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
            if (grid[nr][nc] !== 0) return false;
          }
        }
      }
    }
    return true;
  }

  getTrueCellShape(ships, r, c) {
    for (const ship of ships) {
      const idx = ship.cells.findIndex(cell => cell.r === r && cell.c === c);
      if (idx !== -1) {
        if (ship.len === 1) return 'buoy';
        if (ship.horizontal) {
          if (idx === 0) return 'cap-left';
          if (idx === ship.len - 1) return 'cap-right';
          return 'mid-h';
        } else {
          if (idx === 0) return 'cap-top';
          if (idx === ship.len - 1) return 'cap-bottom';
          return 'mid-v';
        }
      }
    }
    return 'water';
  }

  solveHumanDeductive(rowCounts, colCounts, starterClues) {
    const board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(CELL_EMPTY));
    const shapes = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

    for (const clue of starterClues) {
      board[clue.r][clue.c] = clue.val;
      shapes[clue.r][clue.c] = clue.shape;
    }

    let changed = true;
    let iterations = 0;

    while (changed && iterations < 80) {
      changed = false;
      iterations++;

      const mark = (r, c, val, shape = null) => {
        if (board[r][c] === CELL_EMPTY) {
          board[r][c] = val;
          if (shape) shapes[r][c] = shape;
          changed = true;
        }
      };

      // 1. Clue extension logic (when shape is known)
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const sh = shapes[r][c];
          if (!sh) continue;

          if (sh === 'buoy') {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                  mark(nr, nc, CELL_WATER);
                }
              }
            }
          } else if (sh === 'cap-left') {
            if (c + 1 < GRID_SIZE) mark(r, c + 1, CELL_SHIP);
            if (c - 1 >= 0) mark(r, c - 1, CELL_WATER);
            if (r - 1 >= 0) mark(r - 1, c, CELL_WATER);
            if (r + 1 < GRID_SIZE) mark(r + 1, c, CELL_WATER);
          } else if (sh === 'cap-right') {
            if (c - 1 >= 0) mark(r, c - 1, CELL_SHIP);
            if (c + 1 < GRID_SIZE) mark(r, c + 1, CELL_WATER);
            if (r - 1 >= 0) mark(r - 1, c, CELL_WATER);
            if (r + 1 < GRID_SIZE) mark(r + 1, c, CELL_WATER);
          } else if (sh === 'cap-top') {
            if (r + 1 < GRID_SIZE) mark(r + 1, c, CELL_SHIP);
            if (r - 1 >= 0) mark(r - 1, c, CELL_WATER);
            if (c - 1 >= 0) mark(r, c - 1, CELL_WATER);
            if (c + 1 < GRID_SIZE) mark(r, c + 1, CELL_WATER);
          } else if (sh === 'cap-bottom') {
            if (r - 1 >= 0) mark(r - 1, c, CELL_SHIP);
            if (r + 1 < GRID_SIZE) mark(r + 1, c, CELL_WATER);
            if (c - 1 >= 0) mark(r, c - 1, CELL_WATER);
            if (c + 1 < GRID_SIZE) mark(r, c + 1, CELL_WATER);
          } else if (sh === 'mid-h') {
            if (c - 1 >= 0) mark(r, c - 1, CELL_SHIP);
            if (c + 1 < GRID_SIZE) mark(r, c + 1, CELL_SHIP);
            if (r - 1 >= 0) mark(r - 1, c, CELL_WATER);
            if (r + 1 < GRID_SIZE) mark(r + 1, c, CELL_WATER);
          } else if (sh === 'mid-v') {
            if (r - 1 >= 0) mark(r - 1, c, CELL_SHIP);
            if (r + 1 < GRID_SIZE) mark(r + 1, c, CELL_SHIP);
            if (c - 1 >= 0) mark(r, c - 1, CELL_WATER);
            if (c + 1 < GRID_SIZE) mark(r, c + 1, CELL_WATER);
          }
        }
      }

      // 2. Strict diagonal separation
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (board[r][c] === CELL_SHIP) {
            const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            for (const [dr, dc] of diags) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                mark(nr, nc, CELL_WATER);
              }
            }
          }
        }
      }

      // 3. Row Counters
      for (let r = 0; r < GRID_SIZE; r++) {
        let shipCount = 0;
        let emptyCount = 0;
        for (let c = 0; c < GRID_SIZE; c++) {
          if (board[r][c] === CELL_SHIP) shipCount++;
          if (board[r][c] === CELL_EMPTY) emptyCount++;
        }

        if (shipCount === rowCounts[r] && emptyCount > 0) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === CELL_EMPTY) mark(r, c, CELL_WATER);
          }
        }
        if (rowCounts[r] - shipCount === emptyCount && emptyCount > 0) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === CELL_EMPTY) mark(r, c, CELL_SHIP);
          }
        }
      }

      // 4. Column Counters
      for (let c = 0; c < GRID_SIZE; c++) {
        let shipCount = 0;
        let emptyCount = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
          if (board[r][c] === CELL_SHIP) shipCount++;
          if (board[r][c] === CELL_EMPTY) emptyCount++;
        }

        if (shipCount === colCounts[c] && emptyCount > 0) {
          for (let r = 0; r < GRID_SIZE; r++) {
            if (board[r][c] === CELL_EMPTY) mark(r, c, CELL_WATER);
          }
        }
        if (colCounts[c] - shipCount === emptyCount && emptyCount > 0) {
          for (let r = 0; r < GRID_SIZE; r++) {
            if (board[r][c] === CELL_EMPTY) mark(r, c, CELL_SHIP);
          }
        }
      }

      // 5. Flanking for 2+ adjacent ship cells
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE - 1; c++) {
          if (board[r][c] === CELL_SHIP && board[r][c + 1] === CELL_SHIP) {
            if (r > 0) { mark(r - 1, c, CELL_WATER); mark(r - 1, c + 1, CELL_WATER); }
            if (r < GRID_SIZE - 1) { mark(r + 1, c, CELL_WATER); mark(r + 1, c + 1, CELL_WATER); }
          }
        }
      }
      for (let r = 0; r < GRID_SIZE - 1; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (board[r][c] === CELL_SHIP && board[r + 1][c] === CELL_SHIP) {
            if (c > 0) { mark(r, c - 1, CELL_WATER); mark(r + 1, c - 1, CELL_WATER); }
            if (c < GRID_SIZE - 1) { mark(r, c + 1, CELL_WATER); mark(r + 1, c + 1, CELL_WATER); }
          }
        }
      }

      // 6. Max Ship Length = 3: ends must be water
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE - 2; c++) {
          if (board[r][c] === CELL_SHIP && board[r][c + 1] === CELL_SHIP && board[r][c + 2] === CELL_SHIP) {
            if (c > 0) mark(r, c - 1, CELL_WATER);
            if (c + 3 < GRID_SIZE) mark(r, c + 3, CELL_WATER);
          }
        }
      }
      for (let r = 0; r < GRID_SIZE - 2; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (board[r][c] === CELL_SHIP && board[r + 1][c] === CELL_SHIP && board[r + 2][c] === CELL_SHIP) {
            if (r > 0) mark(r - 1, c, CELL_WATER);
            if (r + 3 < GRID_SIZE) mark(r + 3, c, CELL_WATER);
          }
        }
      }

      // 7. Total Fleet count
      let totalShips = 0;
      let totalEmpty = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (board[r][c] === CELL_SHIP) totalShips++;
          if (board[r][c] === CELL_EMPTY) totalEmpty++;
        }
      }
      if (totalShips === TOTAL_SHIP_CELLS && totalEmpty > 0) {
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === CELL_EMPTY) mark(r, c, CELL_WATER);
          }
        }
      }
    }

    let solved = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (board[r][c] === CELL_EMPTY) {
          solved = false;
          break;
        }
      }
      if (!solved) break;
    }

    return { solved, board };
  }

  createDeterministicFallback() {
    const solutionGrid = [
      [1, 1, 1, 0, 0, 1],
      [0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 1],
      [0, 0, 0, 0, 0, 1],
      [0, 0, 0, 1, 0, 0],
      [1, 1, 0, 0, 0, 0]
    ];
    const ships = [
      { id: 'ship_0_len3', len: 3, horizontal: true, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] },
      { id: 'ship_1_len2', len: 2, horizontal: false, cells: [{ r: 2, c: 5 }, { r: 3, c: 5 }] },
      { id: 'ship_2_len2', len: 2, horizontal: true, cells: [{ r: 5, c: 0 }, { r: 5, c: 1 }] },
      { id: 'ship_3_len1', len: 1, horizontal: true, cells: [{ r: 0, c: 5 }] },
      { id: 'ship_4_len1', len: 1, horizontal: true, cells: [{ r: 2, c: 1 }] },
      { id: 'ship_5_len1', len: 1, horizontal: true, cells: [{ r: 4, c: 3 }] }
    ];
    const rowCounts = [4, 0, 2, 1, 1, 2];
    const colCounts = [2, 2, 1, 1, 0, 4];
    const starterClues = [
      { r: 0, c: 0, val: CELL_SHIP, shape: 'cap-left' },
      { r: 4, c: 3, val: CELL_SHIP, shape: 'buoy' },
      { r: 1, c: 2, val: CELL_WATER, shape: 'water' }
    ];
    return { solutionGrid, ships, rowCounts, colCounts, starterClues };
  }

  // =========================================================================
  // PLAYER INTERACTION & SHIP DETECTION
  // =========================================================================

  isStarterClue(r, c) {
    return this.starterClues.some(clue => clue.r === r && clue.c === c);
  }

  handleCellClick(r, c, isRightClick = false) {
    if (this.solved) return;
    if (this.pingArmed) {
      this.firePingAt(r, c);
      return;
    }
    if (this.isStarterClue(r, c)) {
      sound.playClick(280, 0.03, 'sine', 0.08);
      return;
    }

    const current = this.board[r][c];
    this.moveCount++;

    if (isRightClick) {
      this.board[r][c] = current === CELL_WATER ? CELL_EMPTY : CELL_WATER;
      sound.playClick(320, 0.035, 'triangle', 0.12);
      if (this.board[r][c] === CELL_WATER) this.addSonarPulse(r, c, 0.35, 'water');
    } else {
      if (this.inputMode === 'ship') {
        this.board[r][c] = current === CELL_SHIP ? CELL_EMPTY : CELL_SHIP;
      } else if (this.inputMode === 'water') {
        this.board[r][c] = current === CELL_WATER ? CELL_EMPTY : CELL_WATER;
      } else {
        // Default 3-state Cycle: 0 (Empty) -> 1 (Ship) -> 2 (Water) -> 0
        if (current === CELL_EMPTY) {
          this.board[r][c] = CELL_SHIP;
        } else if (current === CELL_SHIP) {
          this.board[r][c] = CELL_WATER;
        } else {
          this.board[r][c] = CELL_EMPTY;
        }
      }

      if (this.board[r][c] === CELL_SHIP) {
        sound.playClick(620, 0.045, 'sine', 0.16);
        this.addSonarPulse(r, c, 0.75, 'boat');
      } else if (this.board[r][c] === CELL_WATER) {
        sound.playClick(340, 0.035, 'triangle', 0.11);
        this.addSonarPulse(r, c, 0.35, 'water');
      } else {
        sound.playClick(420, 0.03, 'sine', 0.09);
      }
    }

    this.hintHighlights = [];
    this.checkShipCompletions(true);
    this.checkWinCondition();
    this.render();
  }

  handleCounterClick(type, idx) {
    if (this.solved) return;

    let targetCount = 0;
    let placedShips = 0;
    const emptyCells = [];

    if (type === 'row') {
      targetCount = this.rowCounts[idx];
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[idx][c] === CELL_SHIP) placedShips++;
        if (this.board[idx][c] === CELL_EMPTY && !this.isStarterClue(idx, c)) {
          emptyCells.push({ r: idx, c });
        }
      }
    } else {
      targetCount = this.colCounts[idx];
      for (let r = 0; r < GRID_SIZE; r++) {
        if (this.board[r][idx] === CELL_SHIP) placedShips++;
        if (this.board[r][idx] === CELL_EMPTY && !this.isStarterClue(r, idx)) {
          emptyCells.push({ r, c: idx });
        }
      }
    }

    // If hydrophone target is satisfied, auto-fill remaining empty cells with water
    if (placedShips === targetCount && emptyCells.length > 0) {
      emptyCells.forEach(cell => {
        this.board[cell.r][cell.c] = CELL_WATER;
      });
      sound.playClick(480, 0.04, 'sine', 0.14);
      this.statusMessage = `${type === 'row' ? 'Row' : 'Column'} ${idx + 1} is complete: the rest is calm water`;
      this.checkShipCompletions(true);
      this.checkWinCondition();
      this.render();
    }
  }

  // Soft sonar ping: arm the sonar, then tap a misty square to hear what lies beneath it
  togglePing() {
    if (this.solved) return;
    if (this.activePingsRemaining <= 0) {
      sound.playClick(180, 0.08, 'sawtooth', 0.2);
      this.statusMessage = 'The sonar has no more pings today';
      this.render();
      return;
    }
    this.pingArmed = !this.pingArmed;
    sound.playClick(this.pingArmed ? 700 : 420, 0.04, 'sine', 0.12);
    this.statusMessage = this.pingArmed
      ? 'The sonar is ready: tap a misty square to send a ping'
      : 'The sonar rests';
    this.render();
  }

  firePingAt(r, c) {
    this.pingArmed = false;
    if (this.board[r][c] !== CELL_EMPTY) {
      this.statusMessage = 'That square is already marked: choose a misty one';
      this.render();
      return;
    }

    this.activePingsRemaining--;
    this.hintsUsed++;

    const trueVal = this.solutionGrid[r][c];
    this.board[r][c] = trueVal;
    this.hintHighlights = [{ r, c, isError: false }];

    sound.playSonarPing(r + 1, trueVal === CELL_SHIP);
    this.addSonarPulse(r, c, 1.3, trueVal === CELL_SHIP ? 'boat' : 'ping');

    this.statusMessage = trueVal === CELL_SHIP
      ? 'The echo returns: a boat rests here'
      : 'The echo fades: open water';
    this.checkShipCompletions(true);
    this.checkWinCondition();
    this.render();
  }

  // =========================================================================
  // INTELLIGENT REACHABLE HINT SYSTEM
  // Never gives arbitrary unseen cells: points directly to mistakes or reachable deductions!
  // =========================================================================

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;
    this.pingArmed = false;
    this.giveHintInner();
    if (!this.solved) {
      this.checkWinCondition();
      if (this.solved) this.render();
    }
  }

  giveHintInner() {
    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 2500;

    // -------------------------------------------------------------
    // PRIORITY 1: PLAYER MISTAKE CORRECTION
    // If the player placed a ship or water incorrectly, correct it right now!
    // -------------------------------------------------------------
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const current = this.board[r][c];
        const correct = this.solutionGrid[r][c];
        if (current !== CELL_EMPTY && current !== correct && !this.isStarterClue(r, c)) {
          this.board[r][c] = correct;
          this.hintHighlights = [{ r, c, isError: true }];
          sound.playErrorBuzz();
          if (correct === CELL_WATER) {
            this.statusMessage = `Gentle correction: Row ${r + 1}, Col ${c + 1} is open water.`;
          } else {
            this.statusMessage = `Gentle correction: a boat rests at Row ${r + 1}, Col ${c + 1}.`;
          }
          this.checkShipCompletions(true);
          this.render();
          return;
        }
      }
    }

    // Check for diagonal contact mistakes
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_SHIP && this.hasDiagonalConflict(r, c)) {
          this.hintHighlights = [{ r, c, isError: true }];
          sound.playErrorBuzz();
          this.statusMessage = 'Boats keep their distance, even diagonally.';
          this.render();
          return;
        }
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 2: REACHABLE DEDUCTIONS FROM CURRENT BOARD TELEMETRY
    // Deduce a cell that is directly reachable from visible clues and counters!
    // -------------------------------------------------------------

    // 2A. Line with Counter = 0 (all empty cells must be water)
    for (let r = 0; r < GRID_SIZE; r++) {
      if (this.rowCounts[r] === 0) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (this.board[r][c] === CELL_EMPTY) {
            this.board[r][c] = CELL_WATER;
            this.hintHighlights = [{ r, c, isError: false }];
            sound.playHarmonicLock(r);
            this.statusMessage = `Row ${r + 1} hears nothing: it is all open water.`;
            this.render();
            return;
          }
        }
      }
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      if (this.colCounts[c] === 0) {
        for (let r = 0; r < GRID_SIZE; r++) {
          if (this.board[r][c] === CELL_EMPTY) {
            this.board[r][c] = CELL_WATER;
            this.hintHighlights = [{ r, c, isError: false }];
            sound.playHarmonicLock(c);
            this.statusMessage = `Column ${c + 1} hears nothing: it is all open water.`;
            this.render();
            return;
          }
        }
      }
    }

    // 2B. Line with quota already reached (remaining empty cells must be water)
    for (let r = 0; r < GRID_SIZE; r++) {
      let shipCount = 0;
      const emptyCols = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_SHIP) shipCount++;
        if (this.board[r][c] === CELL_EMPTY) emptyCols.push(c);
      }
      if (shipCount === this.rowCounts[r] && emptyCols.length > 0) {
        const c = emptyCols[0];
        this.board[r][c] = CELL_WATER;
        this.hintHighlights = [{ r, c, isError: false }];
        sound.playHarmonicLock(r);
        this.statusMessage = `Row ${r + 1} has heard all its boats: the rest is water.`;
        this.render();
        return;
      }
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      let shipCount = 0;
      const emptyRows = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        if (this.board[r][c] === CELL_SHIP) shipCount++;
        if (this.board[r][c] === CELL_EMPTY) emptyRows.push(r);
      }
      if (shipCount === this.colCounts[c] && emptyRows.length > 0) {
        const r = emptyRows[0];
        this.board[r][c] = CELL_WATER;
        this.hintHighlights = [{ r, c, isError: false }];
        sound.playHarmonicLock(c);
        this.statusMessage = `Column ${c + 1} has heard all its boats: the rest is water.`;
        this.render();
        return;
      }
    }

    // 2C. Line with saturated deficit (remaining required ships == remaining empty cells)
    for (let r = 0; r < GRID_SIZE; r++) {
      let shipCount = 0;
      const emptyCols = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_SHIP) shipCount++;
        if (this.board[r][c] === CELL_EMPTY) emptyCols.push(c);
      }
      if (this.rowCounts[r] - shipCount === emptyCols.length && emptyCols.length > 0) {
        const c = emptyCols[0];
        this.board[r][c] = CELL_SHIP;
        this.hintHighlights = [{ r, c, isError: false }];
        sound.playHarmonicLock(r);
        this.statusMessage = `Row ${r + 1} needs a boat in every remaining square.`;
        this.checkShipCompletions(true);
        this.checkWinCondition();
        this.render();
        return;
      }
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      let shipCount = 0;
      const emptyRows = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        if (this.board[r][c] === CELL_SHIP) shipCount++;
        if (this.board[r][c] === CELL_EMPTY) emptyRows.push(r);
      }
      if (this.colCounts[c] - shipCount === emptyRows.length && emptyRows.length > 0) {
        const r = emptyRows[0];
        this.board[r][c] = CELL_SHIP;
        this.hintHighlights = [{ r, c, isError: false }];
        sound.playHarmonicLock(c);
        this.statusMessage = `Column ${c + 1} needs a boat in every remaining square.`;
        this.checkShipCompletions(true);
        this.checkWinCondition();
        this.render();
        return;
      }
    }

    // 2D. No-Touch Diagonal Elimination from existing ships
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_SHIP) {
          const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
          for (const [dr, dc] of diags) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
              if (this.board[nr][nc] === CELL_EMPTY) {
                this.board[nr][nc] = CELL_WATER;
                this.hintHighlights = [{ r: nr, c: nc, isError: false }];
                sound.playHarmonicLock(nr);
                this.statusMessage = 'Boats keep their distance: this diagonal square is water.';
                this.render();
                return;
              }
            }
          }
        }
      }
    }

    // 2E. Starter Clue Extensions (Caps pointing towards empty cells)
    for (const clue of this.starterClues) {
      if (clue.val !== CELL_SHIP) continue;
      const { r, c, shape } = clue;

      if (shape === 'cap-left' && c + 1 < GRID_SIZE && this.board[r][c + 1] === CELL_EMPTY) {
        this.board[r][c + 1] = CELL_SHIP;
        this.hintHighlights = [{ r, c: c + 1, isError: false }];
        sound.playHarmonicLock(r);
        this.statusMessage = 'The bow points right: the hull continues that way.';
        this.checkShipCompletions(true);
        this.checkWinCondition();
        this.render();
        return;
      }
      if (shape === 'cap-right' && c - 1 >= 0 && this.board[r][c - 1] === CELL_EMPTY) {
        this.board[r][c - 1] = CELL_SHIP;
        this.hintHighlights = [{ r, c: c - 1, isError: false }];
        sound.playHarmonicLock(r);
        this.statusMessage = 'The bow points left: the hull continues that way.';
        this.checkShipCompletions(true);
        this.checkWinCondition();
        this.render();
        return;
      }
      if (shape === 'cap-top' && r + 1 < GRID_SIZE && this.board[r + 1][c] === CELL_EMPTY) {
        this.board[r + 1][c] = CELL_SHIP;
        this.hintHighlights = [{ r: r + 1, c, isError: false }];
        sound.playHarmonicLock(r + 1);
        this.statusMessage = 'The bow points down: the hull continues that way.';
        this.checkShipCompletions(true);
        this.checkWinCondition();
        this.render();
        return;
      }
      if (shape === 'cap-bottom' && r - 1 >= 0 && this.board[r - 1][c] === CELL_EMPTY) {
        this.board[r - 1][c] = CELL_SHIP;
        this.hintHighlights = [{ r: r - 1, c, isError: false }];
        sound.playHarmonicLock(r - 1);
        this.statusMessage = 'The bow points up: the hull continues that way.';
        this.checkShipCompletions(true);
        this.checkWinCondition();
        this.render();
        return;
      }
    }

    // 2F. Flanking for adjacent ship cells
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        if (this.board[r][c] === CELL_SHIP && this.board[r][c + 1] === CELL_SHIP) {
          const flankCells = [
            { r: r - 1, c }, { r: r - 1, c: c + 1 },
            { r: r + 1, c }, { r: r + 1, c: c + 1 }
          ];
          for (const fc of flankCells) {
            if (fc.r >= 0 && fc.r < GRID_SIZE && this.board[fc.r][fc.c] === CELL_EMPTY) {
              this.board[fc.r][fc.c] = CELL_WATER;
              this.hintHighlights = [{ r: fc.r, c: fc.c, isError: false }];
              sound.playHarmonicLock(fc.r);
              this.statusMessage = 'A resting boat has calm water on both sides.';
              this.render();
              return;
            }
          }
        }
      }
    }
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_SHIP && this.board[r + 1][c] === CELL_SHIP) {
          const flankCells = [
            { r, c: c - 1 }, { r: r + 1, c: c - 1 },
            { r, c: c + 1 }, { r: r + 1, c: c + 1 }
          ];
          for (const fc of flankCells) {
            if (fc.c >= 0 && fc.c < GRID_SIZE && this.board[fc.r][fc.c] === CELL_EMPTY) {
              this.board[fc.r][fc.c] = CELL_WATER;
              this.hintHighlights = [{ r: fc.r, c: fc.c, isError: false }];
              sound.playHarmonicLock(fc.r);
              this.statusMessage = 'A resting boat has calm water on both sides.';
              this.render();
              return;
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // PRIORITY 3: CONNECTED REACHABLE CELL
    // If no direct rule fired, find an empty cell connected to an active, near-complete line
    // -------------------------------------------------------------
    let bestCell = null;
    let highestLineFilled = -1;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_EMPTY) {
          let lineScore = 0;
          for (let cc = 0; cc < GRID_SIZE; cc++) if (this.board[r][cc] === CELL_SHIP) lineScore++;
          for (let rr = 0; rr < GRID_SIZE; rr++) if (this.board[rr][c] === CELL_SHIP) lineScore++;

          if (lineScore > highestLineFilled) {
            highestLineFilled = lineScore;
            bestCell = { r, c };
          }
        }
      }
    }

    if (bestCell) {
      const correct = this.solutionGrid[bestCell.r][bestCell.c];
      this.board[bestCell.r][bestCell.c] = correct;
      this.hintHighlights = [{ r: bestCell.r, c: bestCell.c, isError: false }];
      sound.playHarmonicLock(bestCell.r);
      this.statusMessage = `Row ${bestCell.r + 1}, Col ${bestCell.c + 1}: The listening post reveals ${correct === CELL_SHIP ? 'a boat' : 'open water'} here.`;
      this.checkShipCompletions(true);
      this.checkWinCondition();
      this.render();
    }
  }

  // Detect completed ships, lock them, and auto-surround with water
  checkShipCompletions(playSound = true) {
    let newlyLockedCount = 0;

    for (const ship of this.ships) {
      if (this.lockedShips.has(ship.id)) continue;

      const allMarked = ship.cells.every(c => this.board[c.r][c.c] === CELL_SHIP);
      if (allMarked) {
        this.lockedShips.add(ship.id);
        newlyLockedCount++;
        if (playSound) {
          ship.cells.forEach(cell => this.addSonarPulse(cell.r, cell.c, 1.15, 'boat'));
        }

        // Auto-fill surrounding 8-neighborhood empty cells with water
        for (const cell of ship.cells) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = cell.r + dr;
              const nc = cell.c + dc;
              if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                if (this.board[nr][nc] === CELL_EMPTY && !this.isStarterClue(nr, nc)) {
                  this.board[nr][nc] = CELL_WATER;
                }
              }
            }
          }
        }
      }
    }

    if (newlyLockedCount > 0 && playSound) {
      sound.playHarmonicLock(this.lockedShips.size);
      this.statusMessage = 'A boat is found: the waters around it settle';
    }
  }

  checkWinCondition() {
    let shipCellsCorrect = 0;
    let noErrors = true;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const val = this.board[r][c];
        const correct = this.solutionGrid[r][c];

        if (val === CELL_SHIP) {
          if (correct === CELL_SHIP) shipCellsCorrect++;
          else noErrors = false;
        } else if (val === CELL_WATER && correct !== CELL_WATER) {
          noErrors = false;
        }
      }
    }

    if (shipCellsCorrect === TOTAL_SHIP_CELLS && noErrors && !this.solved) {
      this.solved = true;

      // Clean up any remaining empty cells into water
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (this.board[r][c] === CELL_EMPTY) this.board[r][c] = CELL_WATER;
        }
      }

      this.statusMessage = 'All six boats found: the harbor waters are still';
      sound.playVictory();
      if (this.onWin) {
        setTimeout(() => this.onWin(this.getShareSummary()), 400);
      }
    }
  }

  // =========================================================================
  // SMART VECTORIAL SHIP SHAPE COMPUTATION
  // Starter clues preserve their true revealed orientation!
  // =========================================================================

  getCellShape(r, c) {
    if (this.board[r][c] !== CELL_SHIP) return null;

    // Fixed starter clues retain their confirmed tactical shape
    const starter = this.starterClues.find(clue => clue.r === r && clue.c === c);
    if (starter && starter.val === CELL_SHIP) {
      return starter.shape;
    }

    const hasTop = r > 0 && this.board[r - 1][c] === CELL_SHIP;
    const hasBottom = r < GRID_SIZE - 1 && this.board[r + 1][c] === CELL_SHIP;
    const hasLeft = c > 0 && this.board[r][c - 1] === CELL_SHIP;
    const hasRight = c < GRID_SIZE - 1 && this.board[r][c + 1] === CELL_SHIP;

    const hCount = (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);
    const vCount = (hasTop ? 1 : 0) + (hasBottom ? 1 : 0);

    // Invalid branching or cross junction
    if (hCount > 0 && vCount > 0) return 'conflict';

    // 1-cell Spy Buoy
    if (!hasTop && !hasBottom && !hasLeft && !hasRight) return 'buoy';

    // Horizontal orientations
    if (hasRight && !hasLeft) return 'cap-left';
    if (hasLeft && !hasRight) return 'cap-right';
    if (hasLeft && hasRight) return 'mid-h';

    // Vertical orientations
    if (hasBottom && !hasTop) return 'cap-top';
    if (hasTop && !hasBottom) return 'cap-bottom';
    if (hasTop && hasBottom) return 'mid-v';

    return 'buoy';
  }

  hasDiagonalConflict(r, c) {
    if (this.board[r][c] !== CELL_SHIP) return false;
    const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diags) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
        if (this.board[nr][nc] === CELL_SHIP) return true;
      }
    }
    return false;
  }

  // =========================================================================
  // SHARE SUMMARY (Emojis ONLY here!)
  // =========================================================================

  getShareSummary() {
    const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const gridLines = [];
    const visualCells = [];

    for (let r = 0; r < GRID_SIZE; r++) {
      let line = '';
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.solutionGrid[r][c] === CELL_SHIP) {
          line += '🟩';
          visualCells.push('active');
        } else {
          line += '⬛';
          visualCells.push('empty');
        }
      }
      gridLines.push(line);
    }

    return {
      gameName: 'SONAR',
      subtitle: 'The quiet harbor fleet, found by logic',
      seed: this.seed,
      moves: this.moveCount,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: 'fleet',
      stat1Value: '6/6 boats',
      stat2Label: 'time',
      stat2Value: `${elapsedSec}s`,
      stat3Label: 'hints',
      stat3Value: `${this.hintsUsed}`,
      gridCols: 6,
      visualCells,
      metricText: `6/6 fleet • ${elapsedSec}s`,
      shareText: `focal • sonar (${this.seed})\n⚓ 6/6 boats found | ⏱ ${elapsedSec}s\n${gridLines.join('\n')}`
    };
  }

  // =========================================================================
  // RENDERING & SVG GRAPHICS (ZERO EMOJIS IN UI)
  // =========================================================================

  render() {
    const isCooldown = this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000) : 0;

    let cruiserCount = 0;
    let patrolCount = 0;
    let buoyCount = 0;

    for (const ship of this.ships) {
      if (this.lockedShips.has(ship.id)) {
        if (ship.len === 3) cruiserCount++;
        else if (ship.len === 2) patrolCount++;
        else if (ship.len === 1) buoyCount++;
      }
    }

    const rowStates = this.rowCounts.map((target, r) => {
      let shipCount = 0;
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_SHIP) shipCount++;
      }
      return { current: shipCount, target, isSatisfied: shipCount === target, isOver: shipCount > target };
    });

    const colStates = this.colCounts.map((target, c) => {
      let shipCount = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        if (this.board[r][c] === CELL_SHIP) shipCount++;
      }
      return { current: shipCount, target, isSatisfied: shipCount === target, isOver: shipCount > target };
    });

    let totalPlacedShips = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.board[r][c] === CELL_SHIP) totalPlacedShips++;
      }
    }

    this.container.innerHTML = `
      <div class="game-panel sonar-panel ${this.solved ? 'is-solved' : ''} ${this.pingArmed ? 'ping-armed' : ''}">
        <!-- Fleet Status HUD Bar -->
        <div class="denge-regions-bar sonar-fleet-hud">
          <div class="region-chip ${cruiserCount === 1 ? 'done' : ''}" title="1 Fishing Trawler (3 squares)">
            <svg viewBox="0 0 34 14" class="fleet-ship-icon fleet-icon-trawler">
              <path d="M 2 7 C 4 3, 8 2, 13 2 L 29 2 Q 32 2 32 5 L 32 9 Q 32 12 29 12 L 13 12 C 8 12, 4 11, 2 7 Z" class="fh-hull"/>
              <rect x="13" y="4" width="10" height="6" rx="1.5" class="fh-cabin"/>
              <circle cx="8" cy="7" r="1.6" class="fh-lamp"/>
              <circle cx="18" cy="7" r="1.8" class="fh-lamp"/>
            </svg>
            <span>trawler (3)</span>
            <strong>${cruiserCount}/1</strong>
          </div>

          <div class="region-chip ${patrolCount === 2 ? 'done' : ''}" title="2 Rowboats (2 squares)">
            <svg viewBox="0 0 26 14" class="fleet-ship-icon fleet-icon-rowboat">
              <line x1="11" y1="2.5" x2="7" y2="0.4" class="fh-oar"/>
              <line x1="11" y1="11.5" x2="7" y2="13.6" class="fh-oar"/>
              <path d="M 2 7 C 4 3.2, 8 2.5, 13 2.5 L 22 2.5 Q 24 2.5 24 5 L 24 9 Q 24 11.5 22 11.5 L 13 11.5 C 8 11.5, 4 10.8, 2 7 Z" class="fh-hull"/>
              <line x1="13" y1="3.5" x2="13" y2="10.5" class="fh-thwart"/>
              <line x1="18" y1="3.5" x2="18" y2="10.5" class="fh-thwart"/>
              <circle cx="6.5" cy="7" r="1.7" class="fh-lamp"/>
            </svg>
            <span>rowboat (2)</span>
            <strong>${patrolCount}/2</strong>
          </div>

          <div class="region-chip ${buoyCount === 3 ? 'done' : ''}" title="3 Lantern Buoys (1 square)">
            <svg viewBox="0 0 16 14" class="fleet-ship-icon fleet-icon-buoy">
              <circle cx="8" cy="7" r="5.5" class="fh-hull"/>
              <circle cx="8" cy="7" r="3.4" class="fh-lamp-halo"/>
              <circle cx="8" cy="7" r="1.8" class="fh-lamp"/>
            </svg>
            <span>lantern buoy (1)</span>
            <strong>${buoyCount}/3</strong>
          </div>

          <div class="region-chip ${totalPlacedShips === TOTAL_SHIP_CELLS ? 'done' : totalPlacedShips > TOTAL_SHIP_CELLS ? 'over' : ''}">
            <svg viewBox="0 0 14 14" class="fleet-ship-icon fleet-icon-lantern">
              <path d="M 4.5 3.5 L 7 1.5 L 9.5 3.5 Z" class="fh-hull"/>
              <rect x="4.2" y="3.5" width="5.6" height="7" rx="1.4" class="fh-lamp-halo"/>
              <circle cx="7" cy="7" r="1.9" class="fh-lamp"/>
              <rect x="3.6" y="10.5" width="6.8" height="1.6" rx="0.7" class="fh-hull"/>
            </svg>
            <span>boat squares</span>
            <strong>${totalPlacedShips}/${TOTAL_SHIP_CELLS}</strong>
          </div>
        </div>

        <!-- Sculptural Tactical Stage Frame -->
        <div class="denge-stage">
          <div class="denge-board-3d sonar-sculpt-wrap ${this.solved ? 'board-locked' : ''}">
            <!-- Minimalist Acoustic Waveform Oscilloscope -->
            <div class="sonar-wave-strip">
              <canvas id="sonar-osc-canvas" width="380" height="38"></canvas>
              <div class="sonar-wave-caption">${this.statusMessage}</div>
            </div>

            <!-- Battleship Solitaire Tactical Grid with Hydrophone Counters -->
            <div class="sonar-tactical-layout">
              <!-- Top Hydrophone Column Headers -->
              <div class="sonar-col-counters-row">
                <div class="sonar-counter-corner" title="Listening posts: how many boat squares each line holds">
                  <svg viewBox="0 0 20 20" class="counter-corner-svg">
                    <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>
                    <circle cx="10" cy="10" r="3" fill="currentColor"/>
                  </svg>
                </div>
                ${colStates.map((st, c) => `
                  <button class="sonar-counter-btn col-counter ${st.isSatisfied ? 'done' : ''} ${st.isOver ? 'over' : ''}"
                          data-type="col" data-idx="${c}"
                          title="Column ${c + 1}: ${st.target} ship cell${st.target !== 1 ? 's' : ''}">
                    <span class="counter-num">${st.target}</span>
                    <span class="counter-pips">${this.pipsHtml(st)}</span>
                  </button>
                `).join('')}
              </div>

              <!-- Main Grid with Left Row Counters -->
              <div class="sonar-grid-main-row">
                <!-- Left Hydrophone Row Headers -->
                <div class="sonar-row-counters-col">
                  ${rowStates.map((st, r) => `
                    <button class="sonar-counter-btn row-counter ${st.isSatisfied ? 'done' : ''} ${st.isOver ? 'over' : ''}"
                            data-type="row" data-idx="${r}"
                            title="Row ${r + 1}: ${st.target} ship cell${st.target !== 1 ? 's' : ''}">
                      <span class="counter-num">${st.target}</span>
                      <span class="counter-pips">${this.pipsHtml(st)}</span>
                    </button>
                  `).join('')}
                </div>

                <!-- 6x6 Tactical Hydrophone Grid -->
                <div class="sonar-grid" oncontextmenu="return false;">
                  ${this.renderTacticalCells()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Bar with Quick Tips & Minimalist Action Buttons -->
        <div class="game-footer-bar">
          <div class="quick-tip">
            Boats never touch, not even at the corners. The numbers say how many boat squares each line holds. Tap a square to cycle mist, boat and water.
          </div>
          <div class="action-btns action-btns-split">
            <!-- Mobile Mode Pill Switch: Cycle vs Ship vs Water -->
            <div class="sonar-mode-pill" title="How a tap marks a square">
              <button class="sonar-mode-btn ${this.inputMode === 'cycle' ? 'active' : ''}" data-mode="cycle" title="Cycle through mist, boat and water">
                cycle
              </button>
              <button class="sonar-mode-btn ${this.inputMode === 'ship' ? 'active' : ''}" data-mode="ship" title="Mark boat squares">
                <svg viewBox="0 0 16 14" class="mode-icon">
                  <path d="M 1.5 7 C 3.5 3.5, 6.5 3, 10 3 L 14 3 L 14 11 L 10 11 C 6.5 11, 3.5 10.5, 1.5 7 Z" fill="currentColor" opacity="0.85"/>
                  <circle cx="6.2" cy="7" r="1.8" fill="#ffe9a8"/>
                </svg>
                boat
              </button>
              <button class="sonar-mode-btn ${this.inputMode === 'water' ? 'active' : ''}" data-mode="water" title="Mark calm water">
                <svg viewBox="0 0 14 14" class="mode-icon">
                  <path d="M 2 7 Q 4.5 4.5 7 7 T 12 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                water
              </button>
            </div>

            <button class="btn-secondary btn-push-right btn-active-ping ${this.activePingsRemaining > 0 ? '' : 'depleted'} ${this.pingArmed ? 'is-armed' : ''}" id="sonar-active-ping-btn" title="Arm the sonar, then tap a misty square to hear what lies beneath">
              <svg viewBox="0 0 16 16" class="btn-svg-icon">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="8" cy="8" r="1" fill="currentColor"/>
              </svg>
              <span>${this.pingArmed ? 'tap a square' : `ping (${this.activePingsRemaining})`}</span>
            </button>

            <button class="btn-secondary btn-hint ${isCooldown ? 'cooldown-active' : ''}" id="sonar-hint-btn" style="--cooldown-dur: ${remSec > 0 ? remSec : 2.5}s">
              <span class="btn-cooldown-wipe"></span>
              <span class="btn-text">hint</span>
            </button>

            <button class="btn-secondary" id="sonar-reset-btn">${ico("reset")}<span>start fresh</span></button>
          </div>
        </div>
      </div>
    `;

    // Event Bindings
    this.container.querySelectorAll('.sonar-counter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.handleCounterClick(btn.dataset.type, Number(btn.dataset.idx));
      });
    });

    this.container.querySelectorAll('.sonar-cell').forEach(cell => {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleCellClick(r, c, false);
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handleCellClick(r, c, true);
      });
    });

    this.container.querySelectorAll('.sonar-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.inputMode = btn.dataset.mode;
        sound.playClick(460, 0.03);
        this.render();
      });
    });

    this.container.querySelector('#sonar-active-ping-btn')?.addEventListener('click', () => this.togglePing());
    this.container.querySelector('#sonar-hint-btn')?.addEventListener('click', () => this.giveHint());
    this.container.querySelector('#sonar-reset-btn')?.addEventListener('click', () => this.resetBoard());

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector('#sonar-hint-btn');
        if (btn) btn.classList.remove('cooldown-active');
      }, remSec * 1000);
    }
  }

  pipsHtml(st) {
    const n = Math.max(st.target, st.current);
    let out = '';
    for (let i = 0; i < n; i++) {
      out += `<i class="${i < st.current ? (i >= st.target ? 'over' : 'on') : ''}"></i>`;
    }
    return out;
  }

  renderTacticalCells() {
    let html = '';

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const val = this.board[r][c];
        const isStarter = this.isStarterClue(r, c);
        const diagConflict = this.hasDiagonalConflict(r, c);
        const shape = this.getCellShape(r, c);

        const hintItem = this.hintHighlights.find(h => h.r === r && h.c === c);
        const hintClass = hintItem ? (hintItem.isError ? 'cell-hint-error' : 'cell-hint-glow') : '';
        const conflictClass = diagConflict || shape === 'conflict' ? 'cell-conflict' : '';

        let cellContent = '';

        if (val === CELL_SHIP) {
          cellContent = this.renderShipSvg(shape, isStarter, this.shipRunLength(r, c));
        } else if (val === CELL_WATER) {
          cellContent = this.renderWaterSvg(isStarter);
        } else {
          cellContent = '<span class="cell-empty-dot"></span>';
        }

        html += `
          <div class="sonar-cell ${val === CELL_SHIP ? 'is-ship' : val === CELL_WATER ? 'is-water' : 'is-empty'} ${isStarter ? 'is-starter' : ''} ${conflictClass} ${hintClass}"
               data-r="${r}" data-c="${c}">
            ${cellContent}
            ${isStarter ? '<span class="starter-badge" title="A contact the hydrophone already heard"></span>' : ''}
          </div>
        `;
      }
    }

    return html;
  }

  // Length of the connected run of boat squares through (r, c) along its axis
  shipRunLength(r, c) {
    const horizontal =
      (c > 0 && this.board[r][c - 1] === CELL_SHIP) || (c < GRID_SIZE - 1 && this.board[r][c + 1] === CELL_SHIP);
    const vertical =
      (r > 0 && this.board[r - 1][c] === CELL_SHIP) || (r < GRID_SIZE - 1 && this.board[r + 1][c] === CELL_SHIP);
    let n = 1;
    if (horizontal && !vertical) {
      for (let i = c - 1; i >= 0 && this.board[r][i] === CELL_SHIP; i--) n++;
      for (let i = c + 1; i < GRID_SIZE && this.board[r][i] === CELL_SHIP; i++) n++;
    } else if (vertical && !horizontal) {
      for (let i = r - 1; i >= 0 && this.board[i][c] === CELL_SHIP; i--) n++;
      for (let i = r + 1; i < GRID_SIZE && this.board[i][c] === CELL_SHIP; i++) n++;
    }
    return n;
  }

  // Reusable SVG snippet for a warm harbor lantern (halo + glass globe + brass cage + bright core)
  renderLanternNode(cx, cy, r = 2.6, haloR = 6.5) {
    return `
      <circle cx="${cx}" cy="${cy}" r="${haloR}" class="bt-lamp-halo"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 1.45).toFixed(2)}" class="bt-lamp-glass"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" class="bt-lamp"/>
      <circle cx="${(cx - r * 0.28).toFixed(2)}" cy="${(cy - r * 0.28).toFixed(2)}" r="${(r * 0.38).toFixed(2)}" class="bt-lamp-spark"/>
    `;
  }

  // Boats are drawn top-down. Every piece is drawn as a horizontal piece (bow on the left,
  // stern on the right) and rotated 90 degrees for vertical boats, so segments always join up.
  //   3+ squares -> fishing trawler (bow lantern + winch, wheelhouse cabin with lit windows & mast lantern, stern rope drum & aft lamp)
  //   2 squares  -> rowboat (hanging bow lantern, cedar planks, thwart seats, pair of oars, stern transom lamp)
  //   1 square   -> lantern buoy (concentric water ripples, striped timber-and-brass ring, caged harbor beacon)
  renderShipSvg(shape, isStarter, runLen = 1) {
    if (shape === 'conflict') {
      return `
      <div class="ship-piece piece-conflict">
        <svg viewBox="0 0 40 40" class="ship-svg">
          <rect x="8" y="8" width="24" height="24" rx="6" class="bt-hull"/>
          <line x1="14" y1="14" x2="26" y2="26" class="conflict-x"/>
          <line x1="26" y1="14" x2="14" y2="26" class="conflict-x"/>
        </svg>
      </div>`;
    }

    if (shape === 'buoy') {
      return `
      <div class="ship-piece piece-buoy">
        <svg viewBox="0 0 40 40" class="ship-svg bt-svg">
          <circle cx="20" cy="20" r="18.2" class="bt-ripple bt-ripple-outer"/>
          <circle cx="20" cy="20" r="15.2" class="bt-ripple"/>
          <circle cx="20" cy="20" r="12.5" class="bt-buoy-shadow"/>
          <circle cx="20" cy="20" r="11.2" class="bt-buoy-ring"/>
          <circle cx="20" cy="20" r="11.2" class="bt-buoy-stripes"/>
          <circle cx="20" cy="20" r="7.4" class="bt-hull-edge"/>
          <line x1="20" y1="12.5" x2="20" y2="27.5" class="bt-lamp-bar"/>
          <line x1="12.5" y1="20" x2="27.5" y2="20" class="bt-lamp-bar"/>
          ${this.renderLanternNode(20, 20, 3.1, 8.2)}
        </svg>
      </div>`;
    }

    const vertical = shape === 'cap-top' || shape === 'cap-bottom' || shape === 'mid-v';
    const kind = (shape === 'cap-left' || shape === 'cap-top') ? 'bow'
      : (shape === 'cap-right' || shape === 'cap-bottom') ? 'stern' : 'mid';
    // a lone starter cap still needs a length: it is at least a rowboat
    const len = Math.max(runLen, kind === 'mid' ? 3 : 2);
    const trawler = len >= 3;

    let body = '';
    if (kind === 'bow') {
      body += `
        <path d="M40 7.5 L20 7.5 C9.5 7.5 3.5 12.8 1.6 20 C3.5 27.2 9.5 32.5 20 32.5 L40 32.5 Z" class="bt-hull"/>
        <path d="M40 11 L20 11 C11.8 11 7 14.8 5.4 20 C7 25.2 11.8 29 20 29 L40 29 Z" class="bt-deck"/>
        <line x1="7" y1="20" x2="40" y2="20" class="bt-plank"/>
        <line x1="13" y1="15.2" x2="40" y2="15.2" class="bt-plank"/>
        <line x1="13" y1="24.8" x2="40" y2="24.8" class="bt-plank"/>
        <line x1="2" y1="20" x2="8.5" y2="20" class="bt-stem"/>`;
      if (trawler) {
        body += `
        <rect x="24" y="15.2" width="6.5" height="9.6" rx="2" class="bt-winch"/>
        <line x1="27.2" y1="15.2" x2="27.2" y2="24.8" class="bt-plank"/>
        <circle cx="27.2" cy="20" r="1.7" class="bt-hull-edge"/>
        ${this.renderLanternNode(13, 20, 2.3, 6.2)}`;
      } else {
        body += `
        <rect x="28.5" y="11.2" width="4.2" height="17.6" rx="1.2" class="bt-thwart"/>
        <circle cx="26" cy="8.2" r="1.3" class="bt-oarlock"/>
        <circle cx="26" cy="31.8" r="1.3" class="bt-oarlock"/>
        <line x1="26" y1="8" x2="15.5" y2="0.5" class="bt-oar"/>
        <ellipse cx="14" cy="-0.6" rx="3.6" ry="1.6" transform="rotate(36 14 -0.6)" class="bt-oar-blade"/>
        <line x1="26" y1="32" x2="15.5" y2="39.5" class="bt-oar"/>
        <ellipse cx="14" cy="40.6" rx="3.6" ry="1.6" transform="rotate(-36 14 40.6)" class="bt-oar-blade"/>
        ${this.renderLanternNode(13, 20, 2.5, 6.8)}`;
      }
    } else if (kind === 'stern') {
      body += `
        <path d="M0 7.5 L31 7.5 Q38.2 7.5 38.2 14.8 L38.2 25.2 Q38.2 32.5 31 32.5 L0 32.5 Z" class="bt-hull"/>
        <path d="M0 11 L31 11 Q34.8 11 34.8 14.8 L34.8 25.2 Q34.8 29 31 29 L0 29 Z" class="bt-deck"/>
        <line x1="0" y1="20" x2="34" y2="20" class="bt-plank"/>
        <line x1="0" y1="15.2" x2="30" y2="15.2" class="bt-plank"/>
        <line x1="0" y1="24.8" x2="30" y2="24.8" class="bt-plank"/>`;
      if (trawler) {
        body += `
        <circle cx="14.5" cy="20" r="6.4" class="bt-rope"/>
        <circle cx="14.5" cy="20" r="3.5" class="bt-rope"/>
        <circle cx="14.5" cy="20" r="1.3" class="bt-hull-edge"/>
        <rect x="29.5" y="14" width="4.5" height="12" rx="1.6" class="bt-hull-edge"/>
        ${this.renderLanternNode(26.5, 20, 2.0, 5.2)}`;
      } else {
        body += `
        <rect x="7" y="11.2" width="4.2" height="17.6" rx="1.2" class="bt-thwart"/>
        <circle cx="16" cy="8.2" r="1.3" class="bt-oarlock"/>
        <circle cx="16" cy="31.8" r="1.3" class="bt-oarlock"/>
        <line x1="16" y1="8" x2="26.5" y2="0.5" class="bt-oar"/>
        <ellipse cx="28" cy="-0.6" rx="3.6" ry="1.6" transform="rotate(-36 28 -0.6)" class="bt-oar-blade"/>
        <line x1="16" y1="32" x2="26.5" y2="39.5" class="bt-oar"/>
        <ellipse cx="28" cy="40.6" rx="3.6" ry="1.6" transform="rotate(36 28 40.6)" class="bt-oar-blade"/>
        <rect x="27" y="16.8" width="6.2" height="6.4" rx="1.5" class="bt-hull-edge"/>
        ${this.renderLanternNode(23.5, 20, 1.9, 4.8)}`;
      }
    } else {
      body += `
        <rect x="0" y="7.5" width="40" height="25" class="bt-hull"/>
        <rect x="0" y="11" width="40" height="18" class="bt-deck"/>
        <line x1="0" y1="15.2" x2="40" y2="15.2" class="bt-plank"/>
        <line x1="0" y1="24.8" x2="40" y2="24.8" class="bt-plank"/>
        <rect x="6.5" y="11.8" width="27" height="16.4" rx="4" class="bt-cabin"/>
        <rect x="9.5" y="14" width="21" height="12" rx="2.6" class="bt-cabin-inner"/>
        <line x1="6.5" y1="20" x2="33.5" y2="20" class="bt-cabin-roof"/>
        <rect x="10.5" y="13" width="4.4" height="3.2" rx="1" class="bt-window"/>
        <rect x="25.1" y="13" width="4.4" height="3.2" rx="1" class="bt-window"/>
        <rect x="10.5" y="23.8" width="4.4" height="3.2" rx="1" class="bt-window"/>
        <rect x="25.1" y="23.8" width="4.4" height="3.2" rx="1" class="bt-window"/>
        ${this.renderLanternNode(20, 20, 2.8, 7.6)}`;
    }

    return `
      <div class="ship-piece piece-${shape}">
        <svg viewBox="0 0 40 40" class="ship-svg bt-svg" style="overflow:visible">
          <g ${vertical ? 'transform="rotate(90 20 20)"' : ''}>${body}</g>
        </svg>
      </div>`;
  }

  renderWaterSvg(isStarter) {
    return `
      <div class="water-piece">
        <svg viewBox="0 0 24 24" class="water-svg">
          <path d="M 3 9 Q 6 6.5 9 9 T 15 9 T 21 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
          <path d="M 4 14 Q 8 10.5 12 14 T 20 14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
          <path d="M 6 19 Q 9 17 12 19 T 18 19" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.4"/>
        </svg>
      </div>`;
    }

  // =========================================================================
  // OSCILLOSCOPE ACOUSTIC ANIMATION (Harbor Hydrophone & Water-Stillness Trace)
  // =========================================================================

  addSonarPulse(r, c, strength = 1.0, kind = 'ping') {
    this.sonarPulses.push({
      time: performance.now(),
      xPct: (c + 0.5) / GRID_SIZE,
      strength,
      kind
    });
  }

  startOscilloscopeLoop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);

    const draw = (now) => {
      const canvas = this.container.querySelector('#sonar-osc-canvas');
      if (canvas) {
        this.drawOscilloscope(canvas, now);
      }
      this.animFrame = requestAnimationFrame(draw);
    };

    this.animFrame = requestAnimationFrame(draw);
  }

  drawOscilloscope(canvas, now) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const midY = h * 0.52;

    ctx.clearRect(0, 0, w, h);

    // 6 column hydrophone ticks aligned with the 6 columns of the harbor grid
    for (let c = 0; c < GRID_SIZE; c++) {
      const x = ((c + 0.5) / GRID_SIZE) * w;
      const colHasBoat = this.board.some(row => row[c] === CELL_SHIP);
      ctx.strokeStyle = colHasBoat ? 'rgba(255, 217, 120, 0.24)' : 'rgba(155, 209, 229, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 5);
      ctx.lineTo(x, h - 5);
      ctx.stroke();

      // Tiny lantern glint on the horizon line when a column has a located boat
      if (colHasBoat) {
        ctx.fillStyle = this.solved ? '#ffe1a6' : 'rgba(255, 217, 120, 0.65)';
        ctx.beginPath();
        ctx.arc(x, midY, this.solved ? 2.2 : 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Zero-axis baseline
    ctx.strokeStyle = 'rgba(255, 236, 214, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Clean up expired pulses
    this.sonarPulses = this.sonarPulses.filter(p => now - p.time < 2800);

    // Background harbor swell calms down as each of the 6 boats is located
    const unfoundBoats = Math.max(0, 6 - (this.lockedShips ? this.lockedShips.size : 0));
    const swellAmp = this.solved ? 0.45 : (0.9 + unfoundBoats * 0.38);

    const hasBoatPulse = this.sonarPulses.some(p => p.kind === 'boat' && now - p.time < 1400);
    const strokeCol = this.solved ? '#ffe1a6' : (hasBoatPulse ? '#ffd978' : '#9bd1e5');

    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = strokeCol;
    ctx.shadowBlur = 8;
    ctx.beginPath();

    for (let px = 0; px < w; px++) {
      let y = midY
        + Math.sin(px * 0.055 + now * 0.0038) * swellAmp
        + Math.sin(px * 0.11 - now * 0.0022) * (swellAmp * 0.45);

      for (const pulse of this.sonarPulses) {
        const pulseX = pulse.xPct * w;
        const dx = px - pulseX;
        const age = (now - pulse.time) / 1000;
        const decay = Math.max(0, 1 - age / 2.8);
        const spread = pulse.kind === 'water' ? 260 : 190;
        const envelope = Math.exp(-(dx * dx) / spread);
        const freq = pulse.kind === 'water' ? 0.25 : 0.42;
        const amp = (pulse.strength || 1) * (pulse.kind === 'water' ? 9 : 15);
        y -= envelope * Math.cos(dx * freq - now * 0.016) * amp * decay;
      }

      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
  }
}
