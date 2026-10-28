// INSTRUMENT 05 — PRISM (Sunbeam & Crystal)
// 6x6 Grid: Rotate small brass mirrors to guide the morning sunbeam across the room
// and awaken every dormant crystal.
//
// Enriched Design:
//  - Top Optical Sunbeam Chamber with live crystal resonance jewels.
//  - Intricate multi-faceted Quartz Cluster SVGs (dormant twilight amethyst -> awakened golden sunstone)
//    and an Astrolabe Crown Crystal for the final terminal crystal.
//  - Animated light deflection: when a mirror turns, a sweeping light arc, mirror reflection flare,
//    and traveling wavefront animate the sunbeam into its new direction.

import { createRNG } from "./rng.js";
import { sound } from "./audio.js";
import { ico } from "./icons.js";

const GRID_SIZE = 6;
const CELL_PCT = 100 / GRID_SIZE;
const MIN_SOLVE_CLICKS = 3; // fewest mirror turns any solution may need

export class PrismGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = "";
    this.grid = []; // 6x6 of { type, rot, vis, solutionRot, locked, decoy, ... }
    this.emitter = null; // { r, c, dr, dc }
    this.sensors = []; // crystals: { r, c, active, isTerminal }
    this.mirrors = []; // path mirrors: { r, c, solutionRot }
    this.laserPath = []; // array of { x, y, r, c, kind }
    this.prevLaserPath = [];
    this.lastRotatedMirror = null; // { r, c, x, y }
    this.hitSensorsCount = 0;

    this.history = [];
    this.moves = 0;
    this.hintsUsed = 0;
    this.startTime = 0;
    this.solved = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.hintHighlightCell = null;
    this.hintMessage = null;
    this.beamAnimFrame = null;
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = Date.now();
    this.history = [];
    this.prevLaserPath = [];
    this.lastRotatedMirror = null;
    this.hintHighlightCell = null;
    this.hintMessage = null;
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (this.beamAnimFrame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.beamAnimFrame);
    }
    this.hintCooldownTimer = null;
    this.beamAnimFrame = null;

    this.generatePuzzle(seedStr);
    this.traceLaser(true);
    this.render();
  }

  pushHistory() {
    const snap = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = this.grid[r][c];
        if (cell?.type === "mirror") {
          snap.push({ r, c, rot: cell.rot, vis: cell.vis });
        }
      }
    }
    this.history.push(snap);
    if (this.history.length > 60) this.history.shift();
  }

  undo() {
    if (this.solved || this.history.length === 0) return;
    sound.playClick(380);
    const snap = this.history.pop();
    this.prevLaserPath = this.laserPath.map((p) => ({ ...p }));
    snap.forEach(({ r, c, rot, vis }) => {
      const cell = this.grid[r][c];
      if (cell && cell.type === "mirror") {
        cell.rot = rot;
        cell.vis = vis;
      }
    });
    this.hintHighlightCell = null;
    this.hintMessage = null;
    this.traceLaser(true);
    this.update(null);
  }

  // ------------------------------------------------------------------ generation

  generatePuzzle(seedStr) {
    const rng = createRNG(`PRISM_V2_${seedStr}`);

    let generated = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      const board = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => null),
      );
      const reservedCells = new Set();

      const edge = rng.int(0, 1);
      let emitter;
      if (edge === 0)
        emitter = { r: 0, c: rng.int(0, GRID_SIZE - 2), dr: 1, dc: 0 };
      else emitter = { r: rng.int(0, GRID_SIZE - 2), c: 0, dr: 0, dc: 1 };

      board[emitter.r][emitter.c] = {
        type: "emitter",
        dr: emitter.dr,
        dc: emitter.dc,
      };
      reservedCells.add(`${emitter.r},${emitter.c}`);

      const numTurns = rng.int(4, 6);
      let currR = emitter.r;
      let currC = emitter.c;
      let currDr = emitter.dr;
      let currDc = emitter.dc;

      const pathMirrors = [];
      const waypoints = [{ r: emitter.r, c: emitter.c }];
      let success = true;

      for (let t = 0; t < numTurns; t++) {
        let chosenStep = 0;
        let nextR = 0;
        let nextC = 0;

        for (const dist of [rng.int(1, 2), 1]) {
          let clear = true;
          for (let s = 1; s <= dist; s++) {
            const tr = currR + currDr * s;
            const tc = currC + currDc * s;
            if (
              tr < 0 ||
              tr >= GRID_SIZE ||
              tc < 0 ||
              tc >= GRID_SIZE ||
              reservedCells.has(`${tr},${tc}`) ||
              board[tr][tc]
            ) {
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

        const possibleTurns = [];
        if (currDr !== 0) {
          if (
            nextC > 0 &&
            !reservedCells.has(`${nextR},${nextC - 1}`) &&
            !board[nextR][nextC - 1]
          )
            possibleTurns.push({ dr: 0, dc: -1 });
          if (
            nextC < GRID_SIZE - 1 &&
            !reservedCells.has(`${nextR},${nextC + 1}`) &&
            !board[nextR][nextC + 1]
          )
            possibleTurns.push({ dr: 0, dc: 1 });
        } else {
          if (
            nextR > 0 &&
            !reservedCells.has(`${nextR - 1},${nextC}`) &&
            !board[nextR - 1][nextC]
          )
            possibleTurns.push({ dr: -1, dc: 0 });
          if (
            nextR < GRID_SIZE - 1 &&
            !reservedCells.has(`${nextR + 1},${nextC}`) &&
            !board[nextR + 1][nextC]
          )
            possibleTurns.push({ dr: 1, dc: 0 });
        }

        if (possibleTurns.length === 0) {
          success = false;
          break;
        }

        const newDir = rng.pick(possibleTurns);

        let neededAngle = null;
        if (newDir.dr === -currDc && newDir.dc === -currDr) neededAngle = 0;
        else if (newDir.dr === currDc && newDir.dc === currDr) neededAngle = 90;
        if (neededAngle === null) {
          success = false;
          break;
        }

        let traceR = currR + currDr;
        let traceC = currC + currDc;
        while (traceR !== nextR || traceC !== nextC) {
          reservedCells.add(`${traceR},${traceC}`);
          traceR += currDr;
          traceC += currDc;
        }
        reservedCells.add(`${nextR},${nextC}`);

        board[nextR][nextC] = {
          type: "mirror",
          solutionRot: neededAngle,
          rot: neededAngle,
          vis: neededAngle,
          locked: false,
          decoy: false,
        };
        pathMirrors.push({ r: nextR, c: nextC, solutionRot: neededAngle });
        waypoints.push({ r: nextR, c: nextC });

        currR = nextR;
        currC = nextC;
        currDr = newDir.dr;
        currDc = newDir.dc;
      }

      if (!success || pathMirrors.length < 3) continue;

      let terminalDist = 0;
      let sensorR = 0;
      let sensorC = 0;
      for (const dist of [rng.int(1, 2), 1]) {
        let clear = true;
        for (let s = 1; s <= dist; s++) {
          const tr = currR + currDr * s;
          const tc = currC + currDc * s;
          if (
            tr < 0 ||
            tr >= GRID_SIZE ||
            tc < 0 ||
            tc >= GRID_SIZE ||
            reservedCells.has(`${tr},${tc}`) ||
            board[tr][tc]
          ) {
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

      let traceR = currR + currDr;
      let traceC = currC + currDc;
      while (traceR !== sensorR || traceC !== sensorC) {
        reservedCells.add(`${traceR},${traceC}`);
        traceR += currDr;
        traceC += currDc;
      }
      reservedCells.add(`${sensorR},${sensorC}`);

      board[sensorR][sensorC] = {
        type: "sensor",
        isTerminal: true,
        active: false,
      };
      const sensorsList = [{ r: sensorR, c: sensorC, isTerminal: true }];

      const mids = [];
      for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        if (Math.abs(b.r - a.r) === 2 && b.c === a.c)
          mids.push({ r: a.r + (b.r - a.r) / 2, c: a.c });
        else if (Math.abs(b.c - a.c) === 2 && b.r === a.r)
          mids.push({ r: a.r, c: a.c + (b.c - a.c) / 2 });
      }
      const wantedMids = Math.min(mids.length, rng.int(1, 2));
      const shuffledMids = rng.shuffle([...mids]);
      for (let i = 0; i < wantedMids; i++) {
        const m = shuffledMids[i];
        if (board[m.r][m.c]) continue;
        board[m.r][m.c] = { type: "sensor", isTerminal: false, active: false };
        sensorsList.unshift({ r: m.r, c: m.c, isTerminal: false });
      }
      if (sensorsList.length < 2) continue;

      const lockIdx = rng.int(0, pathMirrors.length - 1);
      const lockedMirror = pathMirrors[lockIdx];
      board[lockedMirror.r][lockedMirror.c].locked = true;

      // Decoy mirrors open false routes; pillars then close every route but the real
      // one. Each piece must pay its way (see isMeaningful), so none is mere decoration.
      const emptyCells = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (!board[r][c] && !reservedCells.has(`${r},${c}`))
            emptyCells.push({ r, c });
        }
      }
      // Decoys that line up with the beam's route are the ones likely to matter. Try each
      // spot and orientation, and favour those that open a genuine second route.
      const aligned = emptyCells.filter((e) =>
        waypoints.some((w) => w.r === e.r || w.c === e.c),
      );
      const numDecoys = Math.min(aligned.length, rng.int(3, 4));
      for (let i = 0; i < numDecoys; i++) {
        const spots = aligned.filter((e) => !board[e.r][e.c]);
        if (spots.length === 0) break;
        const before = this.solutionRoutes(board, emitter, sensorsList).size;
        const boosting = [];
        for (const spot of spots) {
          for (const rot of [0, 90]) {
            board[spot.r][spot.c] = {
              type: "mirror",
              solutionRot: null,
              rot,
              vis: rot,
              locked: false,
              decoy: true,
            };
            if (this.solutionRoutes(board, emitter, sensorsList).size > before)
              boosting.push({ ...spot, rot });
            board[spot.r][spot.c] = null;
          }
        }
        const pick =
          boosting.length > 0
            ? rng.pick(boosting)
            : { ...rng.pick(spots), rot: rng.int(0, 1) * 90 };
        board[pick.r][pick.c] = {
          type: "mirror",
          solutionRot: null,
          rot: pick.rot,
          vis: pick.rot,
          locked: false,
          decoy: true,
        };
      }

      const intendedKey = this.routeKey(board);
      let routes = this.solutionRoutes(board, emitter, sensorsList);
      const freeCells = rng.shuffle(emptyCells.filter((e) => !board[e.r][e.c]));
      while (routes.size > 1) {
        let best = null;
        let bestSize = routes.size;
        for (const cell of freeCells) {
          if (board[cell.r][cell.c]) continue;
          board[cell.r][cell.c] = { type: "obstacle" };
          const after = this.solutionRoutes(board, emitter, sensorsList);
          board[cell.r][cell.c] = null;
          if (after.has(intendedKey) && after.size < bestSize) {
            best = cell;
            bestSize = after.size;
          }
        }
        if (!best) break;
        board[best.r][best.c] = { type: "obstacle" };
        routes = this.solutionRoutes(board, emitter, sensorsList);
      }
      if (routes.size > 1) continue;
      this.pruneUseless(board, emitter, sensorsList);

      let numObstacles = 0;
      let numLiveDecoys = 0;
      for (const row of board) {
        for (const item of row) {
          if (item?.type === "obstacle") numObstacles++;
          else if (item?.decoy) numLiveDecoys++;
        }
      }
      if (numObstacles < 1 || numLiveDecoys < 2) continue;

      if (!this.testSolve(board, emitter, sensorsList)) continue;

      // A mirror only has two real orientations, so a click count is the number of
      // mirrors that must flip. Demand a scramble that needs several, not just one.
      let scrambleAttempts = 0;
      let minClicks = 0;
      do {
        for (const m of pathMirrors) {
          const cell = board[m.r][m.c];
          if (cell.locked) continue;
          const turns = rng.int(1, 3);
          cell.rot = (cell.solutionRot + turns * 90) % 360;
          cell.vis = cell.rot;
        }
        minClicks = this.minSolveClicks(board, emitter, sensorsList);
        scrambleAttempts++;
      } while (minClicks < MIN_SOLVE_CLICKS && scrambleAttempts < 30);
      if (minClicks < MIN_SOLVE_CLICKS) continue;

      this.grid = board;
      this.emitter = emitter;
      this.sensors = sensorsList;
      this.mirrors = pathMirrors;
      generated = true;
      break;
    }

    if (!generated) this.fallbackPuzzle();
  }

  testSolve(board, emitter, sensorsList) {
    const hits = this.simulateRay(board, emitter);
    if (!sensorsList || sensorsList.length === 0) return false;
    return sensorsList.every((s) =>
      hits.some((h) => h.r === s.r && h.c === s.c),
    );
  }

  // Fewest mirror flips that light every crystal from the board's current state.
  // Each flip is one click, since a 180° turn leaves the reflection unchanged.
  minSolveClicks(board, emitter, sensorsList) {
    let best = Infinity;
    this.forEachFlipState(board, (mask) => {
      let clicks = 0;
      for (let m = mask; m; m &= m - 1) clicks++;
      if (clicks < best && this.testSolve(board, emitter, sensorsList))
        best = clicks;
    });
    return best;
  }

  flippableMirrors(board) {
    const list = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = board[r][c];
        if (cell?.type === "mirror" && !cell.locked) list.push(cell);
      }
    }
    return list;
  }

  // Calls fn(mask, flippable) for every way of flipping the unlocked mirrors.
  forEachFlipState(board, fn) {
    const flippable = this.flippableMirrors(board);
    const startRots = flippable.map((cell) => cell.rot);
    for (let mask = 0; mask < 1 << flippable.length; mask++) {
      flippable.forEach((cell, i) => {
        cell.rot = (startRots[i] + ((mask >> i) & 1) * 90) % 360;
      });
      fn(mask, flippable);
    }
    flippable.forEach((cell, i) => {
      cell.rot = startRots[i];
    });
  }

  // The settings of the route mirrors alone (decoys left out), e.g. "0110".
  routeKey(board) {
    return this.flippableMirrors(board)
      .filter((cell) => !cell.decoy)
      .map((cell) => (cell.rot % 180) / 90)
      .join("");
  }

  // Every distinct route-mirror setting that lights all crystals, whatever the decoys do.
  solutionRoutes(board, emitter, sensorsList) {
    const routes = new Set();
    this.forEachFlipState(board, () => {
      if (this.testSolve(board, emitter, sensorsList))
        routes.add(this.routeKey(board));
    });
    return routes;
  }

  // A decoy is a false lead if some setting sends the beam through it and on to a
  // crystal, yet leaves the puzzle unsolved.
  isFalseLead(board, decoyCell, emitter, sensorsList) {
    let lead = false;
    this.forEachFlipState(board, () => {
      if (lead) return;
      const trail = [];
      const hits = this.simulateRay(board, emitter, trail);
      const at = trail.indexOf(decoyCell);
      if (
        at < 0 ||
        hits.length === 0 ||
        this.testSolve(board, emitter, sensorsList)
      )
        return;
      lead = trail.slice(at).some((cell) => cell.type === "sensor");
    });
    return lead;
  }

  // A pillar matters if taking it away reopens a route. A decoy matters if, with the
  // pillars lifted, it opens a second route or lures the beam to a crystal: the pillars
  // exist to answer exactly that temptation.
  isMeaningful(board, r, c, emitter, sensorsList) {
    const item = board[r][c];
    const routesOf = () =>
      [...this.solutionRoutes(board, emitter, sensorsList)].sort().join("|");

    if (!item.decoy) {
      const withIt = routesOf();
      board[r][c] = null;
      const withoutIt = routesOf();
      board[r][c] = item;
      return withIt !== withoutIt;
    }

    const pillars = [];
    for (let pr = 0; pr < GRID_SIZE; pr++) {
      for (let pc = 0; pc < GRID_SIZE; pc++) {
        if (board[pr][pc]?.type === "obstacle")
          pillars.push({ r: pr, c: pc, item: board[pr][pc] });
      }
    }
    pillars.forEach((p) => {
      board[p.r][p.c] = null;
    });
    const withIt = routesOf();
    const lead = this.isFalseLead(board, item, emitter, sensorsList);
    board[r][c] = null;
    const withoutIt = routesOf();
    board[r][c] = item;
    pillars.forEach((p) => {
      board[p.r][p.c] = p.item;
    });
    return lead || withIt !== withoutIt;
  }

  // Later pieces can make earlier ones redundant, so drop any that no longer matter.
  pruneUseless(board, emitter, sensorsList) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const item = board[r][c];
          if (!(item?.type === "obstacle" || item?.decoy)) continue;
          if (!this.isMeaningful(board, r, c, emitter, sensorsList)) {
            board[r][c] = null;
            changed = true;
          }
        }
      }
    }
  }

  simulateRay(board, emitter, trail = null) {
    let currR = emitter.r;
    let currC = emitter.c;
    let dr = emitter.dr;
    let dc = emitter.dc;

    const visited = new Set();
    const sensorHits = [];

    for (let step = 0; step < 40; step++) {
      currR += dr;
      currC += dc;
      if (currR < 0 || currR >= GRID_SIZE || currC < 0 || currC >= GRID_SIZE)
        break;

      const stateKey = `${currR},${currC},${dr},${dc}`;
      if (visited.has(stateKey)) break;
      visited.add(stateKey);

      const cell = board[currR][currC];
      if (!cell) continue;
      if (trail) trail.push(cell);
      if (cell.type === "obstacle") break;

      if (cell.type === "sensor") {
        sensorHits.push({ r: currR, c: currC });
        if (cell.isTerminal) break;
      } else if (cell.type === "mirror") {
        const isSlash = cell.rot % 180 === 0;
        const nextDr = isSlash ? -dc : dc;
        const nextDc = isSlash ? -dr : dr;
        dr = nextDr;
        dc = nextDc;
      }
    }
    return sensorHits;
  }

  fallbackPuzzle() {
    const board = Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => null),
    );
    const emitter = { r: 0, c: 1, dr: 1, dc: 0 };
    board[0][1] = { type: "emitter", dr: 1, dc: 0 };

    board[3][1] = {
      type: "mirror",
      solutionRot: 90,
      rot: 0,
      vis: 0,
      locked: false,
      decoy: false,
    };
    board[3][3] = {
      type: "mirror",
      solutionRot: 0,
      rot: 90,
      vis: 90,
      locked: false,
      decoy: false,
    };
    board[1][3] = {
      type: "mirror",
      solutionRot: 0,
      rot: 0,
      vis: 0,
      locked: true,
      decoy: false,
    };
    board[3][2] = { type: "sensor", isTerminal: false, active: false };
    board[1][4] = { type: "sensor", isTerminal: true, active: false };

    board[4][2] = { type: "obstacle" };
    board[0][4] = { type: "obstacle" };
    board[2][0] = {
      type: "mirror",
      solutionRot: null,
      rot: 90,
      vis: 90,
      locked: false,
      decoy: true,
    };

    const fallbackSensors = [
      { r: 3, c: 2, isTerminal: false },
      { r: 1, c: 4, isTerminal: true },
    ];
    this.pruneUseless(board, emitter, fallbackSensors);

    this.grid = board;
    this.emitter = emitter;
    this.sensors = [
      { r: 3, c: 2, isTerminal: false },
      { r: 1, c: 4, isTerminal: true },
    ];
    this.mirrors = [
      { r: 3, c: 1, solutionRot: 90 },
      { r: 3, c: 3, solutionRot: 0 },
      { r: 1, c: 3, solutionRot: 0 },
    ];
  }

  // ------------------------------------------------------------------ beam

  traceLaser(silent = false) {
    const prevHits = this.hitSensorsCount;

    this.sensors.forEach((s) => {
      s.active = false;
      if (this.grid[s.r][s.c]) this.grid[s.r][s.c].active = false;
    });

    const path = [];
    const half = CELL_PCT / 2;

    let currR = this.emitter.r;
    let currC = this.emitter.c;
    let dr = this.emitter.dr;
    let dc = this.emitter.dc;

    path.push({
      x: currC * CELL_PCT + half,
      y: currR * CELL_PCT + half,
      r: currR,
      c: currC,
      kind: "emitter",
    });

    const visited = new Set();
    let hitCount = 0;

    for (let step = 0; step < 40; step++) {
      currR += dr;
      currC += dc;

      if (currR < 0 || currR >= GRID_SIZE || currC < 0 || currC >= GRID_SIZE) {
        const last = path[path.length - 1];
        let bx = last.x;
        let by = last.y;
        if (dc === 1) bx = 100;
        else if (dc === -1) bx = 0;
        if (dr === 1) by = 100;
        else if (dr === -1) by = 0;
        path.push({ x: bx, y: by, r: currR, c: currC, kind: "wall" });
        break;
      }

      const cellX = currC * CELL_PCT + half;
      const cellY = currR * CELL_PCT + half;

      const stateKey = `${currR},${currC},${dr},${dc}`;
      if (visited.has(stateKey)) {
        path.push({ x: cellX, y: cellY, r: currR, c: currC, kind: "loop" });
        break;
      }
      visited.add(stateKey);

      const cell = this.grid[currR][currC];
      if (!cell) continue;

      if (cell.type === "obstacle") {
        path.push({
          x: cellX - dc * half * 0.7,
          y: cellY - dr * half * 0.7,
          r: currR,
          c: currC,
          kind: "pillar",
        });
        break;
      }

      if (cell.type === "sensor") {
        cell.active = true;
        const sObj = this.sensors.find((s) => s.r === currR && s.c === currC);
        if (sObj) sObj.active = true;
        hitCount++;
        path.push({ x: cellX, y: cellY, r: currR, c: currC, kind: "crystal" });
        if (cell.isTerminal) break;
      } else if (cell.type === "mirror") {
        path.push({ x: cellX, y: cellY, r: currR, c: currC, kind: "mirror" });
        const isSlash = cell.rot % 180 === 0;
        const nextDr = isSlash ? -dc : dc;
        const nextDc = isSlash ? -dr : dr;
        dr = nextDr;
        dc = nextDc;
      }
    }

    this.laserPath = path;
    this.hitSensorsCount = hitCount;

    if (!silent && hitCount > prevHits) sound.playPrismSensorHit();

    const allSensorsActive =
      this.sensors.length > 0 && this.sensors.every((s) => s.active);
    if (allSensorsActive && !this.solved) {
      this.solved = true;
      setTimeout(() => sound.playVictory(), 240);
      if (this.onWin) setTimeout(() => this.onWin(this.getShareSummary()), 900);
    }
  }

  // ------------------------------------------------------------------ interaction

  handleMirrorClick(r, c) {
    if (this.solved) return;
    const cell = this.grid[r][c];
    if (!cell || cell.type !== "mirror") return;
    if (cell.locked) {
      sound.playClick(220, 0.05);
      this.shakeCell(r, c);
      return;
    }

    this.pushHistory();
    this.prevLaserPath = this.laserPath.map((p) => ({ ...p }));
    sound.playPrismRotate();
    this.moves++;
    cell.rot = (cell.rot + 90) % 360;
    cell.vis += 90;
    this.hintHighlightCell = null;
    this.hintMessage = null;
    this.lastRotatedMirror = {
      r,
      c,
      x: c * CELL_PCT + CELL_PCT / 2,
      y: r * CELL_PCT + CELL_PCT / 2,
    };

    this.traceLaser();
    this.update(this.beamChanged() ? this.lastRotatedMirror : null);
  }

  // True if the beam now runs differently from before the last turn.
  beamChanged() {
    const a = this.prevLaserPath;
    const b = this.laserPath;
    return (
      a.length !== b.length ||
      a.some((p, i) => p.x !== b[i].x || p.y !== b[i].y || p.kind !== b[i].kind)
    );
  }

  shakeCell(r, c) {
    const el = this.container.querySelector(
      `.px-cell[data-r="${r}"][data-c="${c}"]`,
    );
    if (!el) return;
    el.classList.remove("px-shake");
    void el.offsetWidth;
    el.classList.add("px-shake");
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    const wrongMirror = this.mirrors.find((m) => {
      const cell = this.grid[m.r][m.c];
      return !cell.locked && cell.rot % 180 !== cell.solutionRot % 180;
    });

    if (wrongMirror) {
      this.pushHistory();
      this.prevLaserPath = this.laserPath.map((p) => ({ ...p }));
      const cell = this.grid[wrongMirror.r][wrongMirror.c];
      cell.rot = (cell.rot + 90) % 360;
      cell.vis += 90;
      this.hintHighlightCell = { r: wrongMirror.r, c: wrongMirror.c };
      this.hintMessage = `Row ${wrongMirror.r + 1}, Col ${wrongMirror.c + 1}: Turned this mirror to carry the sunbeam onward.`;
      this.lastRotatedMirror = {
        r: wrongMirror.r,
        c: wrongMirror.c,
        x: wrongMirror.c * CELL_PCT + CELL_PCT / 2,
        y: wrongMirror.r * CELL_PCT + CELL_PCT / 2,
      };
      sound.playPrismRotate();
      this.traceLaser();
      this.update(this.beamChanged() ? this.lastRotatedMirror : null);
    } else {
      sound.playClick(600);
      this.update(null);
    }

    this.armHintCooldown();
  }

  resetPuzzle() {
    if (this.solved) return;
    sound.playClick(320);
    this.loadSeed(this.seed);
  }

  destroy() {
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (this.beamAnimFrame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.beamAnimFrame);
    }
    this.hintCooldownTimer = null;
    this.beamAnimFrame = null;
  }

  getShareSummary() {
    const elapsedSec = Math.max(
      1,
      Math.round((Date.now() - this.startTime) / 1000),
    );
    const visualCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const item = this.grid[r][c];
        if (item?.type === "emitter") visualCells.push("pivot");
        else if (item?.type === "sensor") visualCells.push("active");
        else if (item?.type === "mirror") visualCells.push("blue");
        else visualCells.push("empty");
      }
    }

    const cell = 100 / GRID_SIZE;
    let marks = "";
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const item = this.grid[r][c];
        const x = c * cell + cell / 2;
        const y = r * cell + cell / 2;
        marks += `<rect x="${c * cell + 1}" y="${r * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="2.5" fill="rgba(255,244,230,0.04)" stroke="rgba(255,236,214,0.08)" stroke-width="0.4" />`;
        if (item?.type === "obstacle")
          marks += `<rect x="${x - cell * 0.28}" y="${y - cell * 0.28}" width="${cell * 0.56}" height="${cell * 0.56}" rx="1.5" fill="rgba(255,236,214,0.16)" />`;
        else if (item?.type === "mirror") {
          const s = cell * 0.3;
          const slash = item.rot % 180 === 0;
          marks += `<line x1="${x - s}" y1="${slash ? y + s : y - s}" x2="${x + s}" y2="${slash ? y - s : y + s}" stroke="#9fd1e5" stroke-width="1.6" stroke-linecap="round" />`;
        } else if (item?.type === "sensor")
          marks += `<circle cx="${x}" cy="${y}" r="${cell * 0.2}" fill="#9fe3c4" stroke="#d1fae5" stroke-width="0.8" />`;
        else if (item?.type === "emitter")
          marks += `<circle cx="${x}" cy="${y}" r="${cell * 0.22}" fill="#ffd978" stroke="#fff2b8" stroke-width="0.8" />`;
      }
    }
    const beam = this.laserPath.map((p) => `${p.x},${p.y}`).join(" ");
    const visualSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${marks}<polyline points="${beam}" fill="none" stroke="#ffd978" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.95" /></svg>`;

    const n = this.sensors.length;
    return {
      gameName: "PRISM",
      subtitle: `${n}/${n} crystals awakened`,
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: "time",
      stat1Value: `${elapsedSec}s`,
      stat2Label: "turns",
      stat2Value: `${this.moves}`,
      stat3Label: "crystals",
      stat3Value: `${n}/${n}`,
      gridCols: GRID_SIZE,
      visualCells,
      visualSvg,
      metricText: `${this.moves} turns • ${elapsedSec}s`,
      shareText: `focal • prism (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} turns\n◆ crystals awakened: ${n}/${n}`,
    };
  }

  // ------------------------------------------------------------------ rendering

  static emitterSvg(item) {
    const rot =
      item.dr === 1 ? 90 : item.dc === 1 ? 0 : item.dr === -1 ? 270 : 180;
    return `
      <svg class="px-svg" viewBox="0 0 100 100">
        <!-- Arched Lighthouse Window Frame -->
        <path d="M 20 88 V 45 a 30 30 0 0 1 60 0 V 88 Z" class="px-window-frame" />
        <path d="M 27 82 V 46 a 23 23 0 0 1 46 0 V 82 Z" class="px-window-glass" />
        <!-- Window Mullions -->
        <line x1="50" y1="23" x2="50" y2="82" class="px-window-mullion" />
        <line x1="27" y1="54" x2="73" y2="54" class="px-window-mullion" />
        <!-- Morning Sun & Condenser Lens -->
        <circle cx="50" cy="52" r="14" class="px-sun-halo" />
        <circle cx="50" cy="52" r="9.5" class="px-sun" />
        <g class="px-sun-rays">
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="50" y1="52" x2="50" y2="34" transform="rotate(${a} 50 52)" />`).join("")}
        </g>
        <g transform="rotate(${rot} 50 50)">
          <path d="M 76 50 L 90 50 M 85 45 L 90 50 L 85 55" class="px-emit-arrow" />
        </g>
      </svg>`;
  }

  // Redesigned Sculptural Quartz Cluster & Starlight Sunstone Crystal SVG
  static crystalSvg(active, terminal) {
    if (terminal) {
      // Terminal Crystal: Grand Octagonal Star-Cut Sunstone in a Brass Astrolabe Cradle
      return `
        <svg class="px-svg px-crystal-svg is-terminal-crystal ${active ? "is-awake" : ""}" viewBox="0 0 100 100">
          ${
            active
              ? `
            <circle cx="50" cy="50" r="44" class="px-crystal-aura" />
            <circle cx="50" cy="50" r="37" class="px-crystal-pulse-ring" />
          `
              : ""
          }

          <!-- Brass Astrolabe Cradle Ring & Claws -->
          <circle cx="50" cy="50" r="42" class="px-terminal-ring" />
          <circle cx="50" cy="50" r="34" class="px-cradle-ring" />
          <line x1="50" y1="6" x2="50" y2="14" class="px-cradle-prong" />
          <line x1="50" y1="86" x2="50" y2="94" class="px-cradle-prong" />
          <line x1="6" y1="50" x2="14" y2="50" class="px-cradle-prong" />
          <line x1="86" y1="50" x2="94" y2="50" class="px-cradle-prong" />

          <!-- Outer 8-Point Star Crown Facets -->
          <polygon points="50,11 61,28 82,18 72,39 89,50 72,61 82,82 61,72 50,89 39,72 18,82 28,61 11,50 28,39 18,18 39,28" class="px-gem-star-crown" />

          <!-- Main Faceted Octagonal Gem -->
          <polygon points="50,15 73,27 85,50 73,73 50,85 27,73 15,50 27,27" class="px-gem-body" />
          <!-- Upper & Side Facet Planes -->
          <polygon points="50,15 73,27 62,38 50,33 38,38 27,27" class="px-gem-top" />
          <polygon points="15,50 27,27 38,38 33,50 38,62 27,73" class="px-gem-left" />
          <polygon points="85,50 73,27 62,38 67,50 62,62 73,73" class="px-gem-right" />
          <polygon points="50,85 27,73 38,62 50,67 62,62 73,73" class="px-gem-bottom" />

          <!-- Central Table Facet -->
          <polygon points="50,33 62,38 67,50 62,62 50,67 38,62 33,50 38,38" class="px-gem-table" />

          <!-- Internal Refraction Lines -->
          <path d="M 50,15 L 50,33 M 85,50 L 67,50 M 50,85 L 50,67 M 15,50 L 33,50 M 38,38 L 62,62 M 62,38 L 38,62" class="px-gem-seam" />

          <!-- Specular Starlight Glint -->
          <circle cx="44" cy="43" r="2.8" class="px-gem-spark" />
          ${
            active
              ? `
            <path d="M 50 22 L 52.2 47.8 L 78 50 L 52.2 52.2 L 50 78 L 47.8 52.2 L 22 50 L 47.8 47.8 Z" class="px-crystal-starflare" />
          `
              : ""
          }
        </svg>
      `;
    }

    // Intermediate Crystal: Sculpted Double-Terminated Prismatic Quartz Cluster
    return `
      <svg class="px-svg px-crystal-svg ${active ? "is-awake" : ""}" viewBox="0 0 100 100">
        ${
          active
            ? `
          <circle cx="50" cy="50" r="41" class="px-crystal-aura" />
          <circle cx="50" cy="50" r="33" class="px-crystal-pulse-ring" />
        `
            : ""
        }

        <!-- Brass Pedestal Base & Cradle Ring -->
        <circle cx="50" cy="52" r="33" class="px-cradle-ring" />
        <path d="M 32 82 L 68 82 L 63 89 L 37 89 Z" class="px-cradle-base" />

        <!-- Left Side Quartz Shard -->
        <g class="px-side-shard left">
          <polygon points="20,28 35,33 41,66 26,72 16,46" class="px-gem-left" />
          <polygon points="20,28 35,33 29,48 16,46" class="px-gem-top" />
          <line x1="20" y1="28" x2="29" y2="48" class="px-gem-seam" />
        </g>

        <!-- Right Side Quartz Shard -->
        <g class="px-side-shard right">
          <polygon points="80,30 84,48 73,72 59,66 65,35" class="px-gem-right" />
          <polygon points="80,30 84,48 71,50 65,35" class="px-gem-top" />
          <line x1="80" y1="30" x2="71" y2="50" class="px-gem-seam" />
        </g>

        <!-- Central Tall Double-Terminated Quartz Spire -->
        <polygon points="50,9 69,30 65,69 50,90 35,69 31,30" class="px-gem-body" />
        <!-- Upper Crown Facets -->
        <polygon points="50,9 69,30 50,39 31,30" class="px-gem-top" />
        <polygon points="50,9 50,39 31,30" class="px-gem-crown-left" />
        <!-- Left & Right Column Facets -->
        <polygon points="31,30 50,39 50,72 35,69" class="px-gem-left" />
        <polygon points="69,30 50,39 50,72 65,69" class="px-gem-right" />
        <!-- Lower Termination Facets -->
        <polygon points="35,69 50,72 65,69 50,90" class="px-gem-bottom" />
        <!-- Central Diamond Table -->
        <polygon points="50,24 59,39 50,64 41,39" class="px-gem-table" />
        <!-- Facet Ridges -->
        <path d="M 50,9 L 50,90 M 31,30 L 50,39 L 69,30 M 35,69 L 50,72 L 65,69" class="px-gem-seam" />

        <!-- Specular Highlights -->
        <circle cx="45" cy="31" r="2.2" class="px-gem-spark" />
        <circle cx="25" cy="39" r="1.4" class="px-gem-spark" />
        <circle cx="74" cy="41" r="1.4" class="px-gem-spark" />
        ${
          active
            ? `
          <path d="M 50 18 L 51.8 44.2 L 74 46 L 51.8 47.8 L 50 74 L 48.2 47.8 L 26 46 L 48.2 44.2 Z" class="px-crystal-starflare" />
        `
            : ""
        }
      </svg>`;
  }

  static mirrorSvg(item) {
    return `
      <svg class="px-svg px-mirror-svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="35" class="px-mirror-ring" />
        <circle cx="50" cy="50" r="29" class="px-mirror-inner-ring" />
        <line x1="23" y1="77" x2="77" y2="23" class="px-mirror-glass-bg" />
        <line x1="24" y1="76" x2="76" y2="24" class="px-mirror-glass" />
        <line x1="30" y1="66" x2="66" y2="30" class="px-mirror-specular" />
        <circle cx="50" cy="50" r="4.5" class="px-mirror-pivot" />
        ${
          item.locked
            ? `
          <circle cx="21" cy="50" r="3.4" class="px-rivet" /><circle cx="79" cy="50" r="3.4" class="px-rivet" />
          <circle cx="50" cy="21" r="3.4" class="px-rivet" /><circle cx="50" cy="79" r="3.4" class="px-rivet" />`
            : ""
        }
      </svg>`;
  }

  static pillarSvg() {
    return `
      <svg class="px-svg" viewBox="0 0 100 100">
        <rect x="22" y="20" width="56" height="60" rx="7" class="px-stone" />
        <rect x="27" y="25" width="46" height="50" rx="4" class="px-stone-inner" />
        <path d="M 22 44 H 78 M 44 20 V 44 M 58 44 V 80" class="px-stone-seam" />
      </svg>`;
  }

  buildCellInner(item) {
    if (!item) return '<span class="px-dot"></span>';
    if (item.type === "emitter") return PrismGame.emitterSvg(item);
    if (item.type === "sensor")
      return PrismGame.crystalSvg(item.active, item.isTerminal);
    if (item.type === "obstacle") return PrismGame.pillarSvg();
    if (item.type === "mirror")
      return `<div class="px-mirror-rotor" style="transform: rotate(${item.vis}deg)">${PrismGame.mirrorSvg(item)}</div>`;
    return "";
  }

  buildBoardHtml() {
    let html = "";
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const item = this.grid[r][c];
        let cls = "px-cell";
        let title = "";
        if (item?.type === "emitter") {
          cls += " px-emitter";
          title = "The window: the morning sunbeam enters here";
        } else if (item?.type === "sensor") {
          cls += item.active ? " px-crystal px-awake" : " px-crystal";
          title = item.isTerminal
            ? "Crown sunstone crystal (absorbs the beam)"
            : "Prismatic quartz crystal";
        } else if (item?.type === "obstacle") {
          cls += " px-pillar";
          title = "Granite pillar: blocks the light";
        } else if (item?.type === "mirror") {
          cls += item.locked ? " px-mirror px-fixed" : " px-mirror";
          title = item.locked
            ? "Bolted brass mirror: fixed angle"
            : "Brass mirror: tap to turn";
        }
        html += `<div class="${cls}" data-r="${r}" data-c="${c}" title="${title}"><div class="px-cell-inner">${this.buildCellInner(item)}</div></div>`;
      }
    }
    return html;
  }

  // Top Optical Chamber HUD with miniature crystal icons
  hudHtml() {
    const total = this.sensors.length;
    const lit = this.hitSensorsCount;
    const crystalIcons = this.sensors
      .map(
        (s) => `
      <span class="px-hud-gem ${s.active ? "is-lit" : ""} ${s.isTerminal ? "is-terminal" : ""}" title="${s.isTerminal ? "Crown crystal" : "Quartz crystal"}">
        <svg viewBox="0 0 20 20"><polygon points="10,2 16,7 16,13 10,18 4,13 4,7" /></svg>
      </span>
    `,
      )
      .join("");

    return `
      <div class="hud-card">
        <span class="hud-label">crystals awakened</span>
        <div class="hud-value ${lit === total ? "ok" : ""}" id="px-hud-lit" style="display:flex;align-items:center;gap:8px;">
          <span>${lit} / ${total}</span>
          <span class="px-hud-gems">${crystalIcons}</span>
        </div>
      </div>
      <div class="hud-card" style="text-align: center;">
        <span class="hud-label">the sunbeam</span>
        <div class="status-pill ${this.solved ? "solved" : ""}" id="px-hud-status">${this.statusText()}</div>
      </div>
      <div class="hud-card" style="text-align: right;">
        <span class="hud-label">mirror turns</span>
        <div class="hud-value" id="px-hud-moves">${this.moves} <span style="font-size:12px;opacity:0.7;">turns</span></div>
      </div>`;
  }

  statusText() {
    if (this.solved) return `${ico("check")} Every crystal awake`;
    if (this.hitSensorsCount === 0) return "The beam wanders";
    return `${this.hitSensorsCount} of ${this.sensors.length} crystals lit`;
  }

  // Build SVG reflection glints at every mirror vertex & crystal hit point
  buildBeamNodesSvg(rotatedMirror) {
    let html = "";
    for (let i = 1; i < this.laserPath.length; i++) {
      const pt = this.laserPath[i];
      if (pt.kind === "mirror") {
        const isTurned =
          rotatedMirror && rotatedMirror.r === pt.r && rotatedMirror.c === pt.c;
        html += `
          <g class="px-beam-node ${isTurned ? "is-turned-flare" : ""}" transform="translate(${pt.x}, ${pt.y})">
            ${isTurned ? `<circle cx="0" cy="0" r="8" class="px-turn-flare-ring" />` : ""}
            <circle cx="0" cy="0" r="2.8" class="px-vertex-halo" />
            <path d="M 0 -4.8 L 1.1 -1.1 L 4.8 0 L 1.1 1.1 L 0 4.8 L -1.1 1.1 L -4.8 0 L -1.1 -1.1 Z" class="px-vertex-star" />
          </g>
        `;
      } else if (pt.kind === "crystal") {
        html += `
          <g class="px-beam-node is-crystal-hit" transform="translate(${pt.x}, ${pt.y})">
            <circle cx="0" cy="0" r="6.5" class="px-crystal-hit-ring" />
            <circle cx="0" cy="0" r="2.2" fill="#ffffff" />
          </g>
        `;
      } else if (pt.kind === "pillar" || pt.kind === "wall") {
        html += `<circle cx="${pt.x}" cy="${pt.y}" r="1.8" class="px-beam-stop-dot" />`;
      }
    }
    return html;
  }

  render() {
    const isCooldown =
      this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown
      ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000)
      : 0;

    this.container.innerHTML = `
      <div class="game-panel prism-panel ${this.solved ? "is-solved" : ""}">
        <div class="prism-hud" id="px-hud">${this.hudHtml()}</div>

        <div class="prism-stage-wrapper">
          <div class="px-board" id="prism-grid-board" style="--px-n: ${GRID_SIZE}">
            ${this.buildBoardHtml()}
            <div class="px-motes" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span><span></span>
            </div>
            <svg class="prism-laser-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <filter id="px-beam-glow" x="-25%" y="-25%" width="150%" height="150%">
                  <feGaussianBlur stdDeviation="1.6" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <!-- Ghost sweep ray when a mirror deflects the beam -->
              <polyline id="px-beam-sweep" points="" class="px-beam-sweep" />
              <!-- Main sunbeam layers -->
              <polyline id="px-beam-outer" points="" class="px-beam-outer" />
              <polyline id="px-beam-core" points="" class="px-beam-core" filter="url(#px-beam-glow)" />
              <polyline id="px-beam-flow" points="" class="px-beam-flow" />
              <!-- Reflection glints, turn flares & traveling wavefront photon -->
              <g id="px-beam-nodes"></g>
              <circle id="px-travel-photon" cx="-10" cy="-10" r="2.4" class="px-travel-photon" opacity="0" />
            </svg>
          </div>
        </div>

        <div id="px-hint-slot"></div>

        <div class="action-btns" style="justify-content: space-between; align-items: center; margin-top: 4px; flex-wrap: wrap;">
          <div style="display:flex; gap:8px;">
            <button id="prism-undo-btn" class="btn-secondary" ${this.history.length === 0 || this.solved ? "disabled" : ""}>${ico("undo")}<span>undo</span></button>
            <button id="prism-reset-btn" class="btn-secondary" title="Return every mirror to its starting angle">${ico("reset")}<span>start fresh</span></button>
          </div>
          <div class="px-legend">
            <span><i class="px-lg px-lg-mirror"></i>turn</span>
            <span><i class="px-lg px-lg-fixed"></i>bolted</span>
            <span><i class="px-lg px-lg-stone"></i>pillar</span>
          </div>
          <button id="prism-hint-btn" class="btn-secondary btn-hint ${isCooldown ? "cooldown-active" : ""}"
                  style="--cooldown-dur: ${remSec}s" ${isCooldown ? "disabled" : ""}>
            <span class="btn-text">hint (${this.hintsUsed})</span>
            <span class="btn-cooldown-wipe"></span>
          </button>
        </div>
      </div>
    `;

    this.container.querySelectorAll(".px-mirror").forEach((el) => {
      el.addEventListener("click", () => {
        this.handleMirrorClick(
          parseInt(el.dataset.r, 10),
          parseInt(el.dataset.c, 10),
        );
      });
    });
    this.container
      .querySelector("#prism-undo-btn")
      ?.addEventListener("click", () => this.undo());
    this.container
      .querySelector("#prism-hint-btn")
      ?.addEventListener("click", () => this.giveHint());
    this.container
      .querySelector("#prism-reset-btn")
      ?.addEventListener("click", () => this.resetPuzzle());

    this.update(null);
    this.armHintCooldown();
  }

  armHintCooldown() {
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
    const btn = this.container.querySelector("#prism-hint-btn");
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

  // Compute polyline length for dasharray sweep animation
  static pathLength(ptsArray) {
    let len = 0;
    for (let i = 1; i < ptsArray.length; i++) {
      len += Math.hypot(
        ptsArray[i].x - ptsArray[i - 1].x,
        ptsArray[i].y - ptsArray[i - 1].y,
      );
    }
    return len;
  }

  // Sample point at distance d along ptsArray
  static pointAtLength(ptsArray, targetDist) {
    if (ptsArray.length === 0) return { x: 0, y: 0 };
    let acc = 0;
    for (let i = 1; i < ptsArray.length; i++) {
      const a = ptsArray[i - 1];
      const b = ptsArray[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= targetDist && seg > 0) {
        const t = (targetDist - acc) / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      acc += seg;
    }
    return ptsArray[ptsArray.length - 1];
  }

  // Animate the sunbeam when a mirror turns and deflects the ray
  animateBeamChange(root, rotatedMirror) {
    if (!rotatedMirror || typeof requestAnimationFrame !== "function") return;

    const outerEl = root.querySelector("#px-beam-outer");
    const coreEl = root.querySelector("#px-beam-core");
    const sweepEl = root.querySelector("#px-beam-sweep");
    const photonEl = root.querySelector("#px-travel-photon");
    if (!outerEl || !coreEl) return;

    // Show the fading ghost of the old path while the new path sweeps in
    if (sweepEl && this.prevLaserPath && this.prevLaserPath.length > 1) {
      const prevPts = this.prevLaserPath.map((p) => `${p.x},${p.y}`).join(" ");
      sweepEl.setAttribute("points", prevPts);
      sweepEl.classList.remove("is-sweeping");
      void sweepEl.offsetWidth;
      sweepEl.classList.add("is-sweeping");
    }

    // Find where the rotated mirror sits along the new path so upstream light stays steady
    // while the deflected downstream ray draws outward from the mirror
    const totalLen = PrismGame.pathLength(this.laserPath);
    if (totalLen <= 0) return;

    let pivotIdx = this.laserPath.findIndex(
      (p) => p.r === rotatedMirror.r && p.c === rotatedMirror.c,
    );
    if (pivotIdx < 0) pivotIdx = 0;
    const upstreamLen = PrismGame.pathLength(
      this.laserPath.slice(0, pivotIdx + 1),
    );
    const downstreamLen = Math.max(0, totalLen - upstreamLen);

    if (downstreamLen <= 0.5) return;

    if (this.beamAnimFrame) cancelAnimationFrame(this.beamAnimFrame);
    const startTime =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const duration = 270; // ms synced with mirror 90-degree turn

    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / duration));
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const visibleLen = upstreamLen + downstreamLen * eased;

      outerEl.style.strokeDasharray = `${visibleLen.toFixed(2)} ${(totalLen + 20).toFixed(2)}`;
      coreEl.style.strokeDasharray = `${visibleLen.toFixed(2)} ${(totalLen + 20).toFixed(2)}`;

      if (photonEl) {
        if (t < 1) {
          const tip = PrismGame.pointAtLength(this.laserPath, visibleLen);
          photonEl.setAttribute("cx", tip.x.toFixed(2));
          photonEl.setAttribute("cy", tip.y.toFixed(2));
          photonEl.setAttribute("opacity", String((1 - t * 0.65).toFixed(2)));
        } else {
          photonEl.setAttribute("opacity", "0");
        }
      }

      if (t < 1) {
        this.beamAnimFrame = requestAnimationFrame(step);
      } else {
        outerEl.style.strokeDasharray = "";
        coreEl.style.strokeDasharray = "";
        this.beamAnimFrame = null;
      }
    };

    this.beamAnimFrame = requestAnimationFrame(step);
  }

  // In-place refresh: keeps mirror rotation transitions and beam animations smooth
  update(rotatedMirror = null) {
    const root = this.container.querySelector(".prism-panel");
    if (!root) return;

    root.classList.toggle("is-solved", this.solved);

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const item = this.grid[r][c];
        const el = root.querySelector(`.px-cell[data-r="${r}"][data-c="${c}"]`);
        if (!el || !item) continue;

        if (item.type === "mirror") {
          const rotor = el.querySelector(".px-mirror-rotor");
          if (rotor) rotor.style.transform = `rotate(${item.vis}deg)`;
          const isHint =
            this.hintHighlightCell &&
            this.hintHighlightCell.r === r &&
            this.hintHighlightCell.c === c;
          el.classList.toggle("cell-hint-glow", !!isHint);
        } else if (item.type === "sensor") {
          const was = el.classList.contains("px-awake");
          if (was !== !!item.active) {
            el.classList.toggle("px-awake", !!item.active);
            el.querySelector(".px-cell-inner").innerHTML = PrismGame.crystalSvg(
              item.active,
              item.isTerminal,
            );
            el.title = item.active
              ? "Awakened crystal"
              : item.isTerminal
                ? "Crown sunstone crystal"
                : "Dormant quartz crystal";
          }
        }
      }
    }

    const pts = this.laserPath.map((p) => `${p.x},${p.y}`).join(" ");
    ["px-beam-outer", "px-beam-core", "px-beam-flow"].forEach((id) => {
      root.querySelector(`#${id}`)?.setAttribute("points", pts);
    });

    const nodesEl = root.querySelector("#px-beam-nodes");
    if (nodesEl) {
      nodesEl.innerHTML = this.buildBeamNodesSvg(rotatedMirror);
    }

    if (rotatedMirror) {
      this.animateBeamChange(root, rotatedMirror);
    }

    const hud = root.querySelector("#px-hud");
    if (hud) hud.innerHTML = this.hudHtml();

    const undoBtn = root.querySelector("#prism-undo-btn");
    if (undoBtn) {
      if (this.history.length === 0 || this.solved)
        undoBtn.setAttribute("disabled", "");
      else undoBtn.removeAttribute("disabled");
    }

    const hintSlot = root.querySelector("#px-hint-slot");
    if (hintSlot) {
      hintSlot.innerHTML = this.hintMessage
        ? `
          <div class="res-hint-banner active" id="px-hint-banner" title="Click to dismiss">
            <span class="res-hint-badge">${ico("lantern")}</span>
            <span class="res-hint-text">${this.hintMessage}</span>
          </div>
        `
        : "";
      hintSlot
        .querySelector("#px-hint-banner")
        ?.addEventListener("click", () => {
          this.hintMessage = null;
          this.update(null);
        });
    }
  }
}
