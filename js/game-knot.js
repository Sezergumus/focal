// MODULE 06 — KNOT (The Constellation Threads)
// Drag the stars until no thread crosses another. As the threads untangle,
// the haze over the night sky clears and the constellation is revealed.

import { createRNG } from "./rng.js";
import { sound } from "./audio.js";
import { ico } from "./icons.js";

const MIN_STAR_GAP = 10; // stars cannot be stacked on top of one another

// Every day's constellation is drawn fresh: scatter stars, join them with threads that never cross,
// then name the figure that appeared. The scattered layout is the guaranteed 0-crossing solution.
const NAME_ADJECTIVES = [
  "Sleeping", "Silver", "Quiet", "Drifting", "Salt-Worn", "Wandering",
  "Hollow", "Amber", "Gentle", "Midnight", "Tidal", "Patient",
];
const NAME_NOUNS = [
  "Heron", "Skiff", "Lantern", "Fox", "Gull", "Anchor",
  "Lighthouse", "Crown", "Harp", "Kite", "Moth", "Compass",
];
const EPILOGUES = [
  (n) => `${n} settles into the sky, and the harbor lights dim one by one.`,
  (n) => `${n} stands clear above the tide line, wings folded.`,
  (n) => `The haze lifts, and ${n} keeps watch over Quiet Harbor.`,
  (n) => `${n} glows steadily — the night has found its shape again.`,
  (n) => `Somewhere below, the boats turn toward ${n} and sail home.`,
];

const STAR_COUNT_MIN = 6;
const STAR_COUNT_MAX = 8;
const THREADS_PER_STAR = 1.45; // sparse enough to read, dense enough to tangle
const STAR_SPREAD_GAP = 20; // generated stars keep clear of each other
const THREAD_CLEARANCE = 4; // a thread never grazes a star it doesn't join

export class KnotGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = "";
    this.template = null;
    this.nodes = []; // { id, x, y, solX, solY, initialX, initialY }
    this.edges = []; // [u, v]
    this.intersections = [];
    this.lastIntersectionCount = 0;
    this.initialCrossings = 1;
    this.skyStars = [];

    this.draggedNodeId = null;
    this.dragOffset = { x: 0, y: 0 };
    this.svgRect = null;

    this.moves = 0;
    this.hintsUsed = 0;
    this.startTime = 0;
    this.solved = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.hintNodeId = null;

    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = Date.now();
    this.draggedNodeId = null;
    this.hintNodeId = null;
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;

    this.generatePuzzle(seedStr);
    this.computeIntersections();
    this.lastIntersectionCount = this.intersections.length;
    this.initialCrossings = Math.max(1, this.intersections.length);

    this.render();
  }

  // ------------------------------------------------------------------ generation

  generatePuzzle(seedStr) {
    const rng = createRNG(`KNOT_V2_${seedStr}`);

    const tmpl = this.generateConstellation(
      rng,
      rng.int(STAR_COUNT_MIN, STAR_COUNT_MAX),
    );
    this.template = tmpl;
    this.edges = tmpl.edges.map((e) => [...e]);
    const n = tmpl.numNodes;
    const pinnedIds = tmpl.pinned;

    // Start from the solved figure and displace only a few stars (a cycle of them trade places).
    // Everything else is already where it belongs, so the tangled threads point at the stars that
    // need to move and the figure can be reasoned out instead of found by trial and error.
    const minCross = 2;
    const maxCross = Math.max(minCross + 2, Math.floor(this.edges.length * 0.5));
    const free = [...Array(n).keys()].filter((id) => !pinnedIds.includes(id));
    const moveCount = Math.min(free.length, n <= 6 ? 3 : 4);

    let best = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < 300; attempt++) {
      const moved = rng.shuffle(free).slice(0, moveCount);
      const shift = rng.int(1, moveCount - 1);
      const candidate = tmpl.solutionCoords.map((p, id) => ({
        id,
        x: p.x,
        y: p.y,
        solX: p.x,
        solY: p.y,
        initialX: p.x,
        initialY: p.y,
      }));
      moved.forEach((id, k) => {
        const src = tmpl.solutionCoords[moved[(k + shift) % moveCount]];
        candidate[id].x = candidate[id].initialX = src.x;
        candidate[id].y = candidate[id].initialY = src.y;
      });

      const crossings = this.countIntersections(candidate, this.edges);
      if (crossings >= minCross && crossings <= maxCross) {
        best = candidate;
        break;
      }
      // keep the best fallback: at least some crossings, closest to the sweet spot
      const score =
        crossings === 0
          ? 0
          : 100 - Math.abs(crossings - (minCross + maxCross) / 2);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    // Absolute fallback: mirror the solution, swap two stars so it is tangled
    if (!best || this.countIntersections(best, this.edges) === 0) {
      best = tmpl.solutionCoords.map((p, id) => ({
        id,
        x: p.x,
        y: p.y,
        solX: p.x,
        solY: p.y,
        initialX: p.x,
        initialY: p.y,
      }));
      for (
        let k = 0;
        k < 6 && this.countIntersections(best, this.edges) < 3;
        k++
      ) {
        const a = rng.int(0, n - 1);
        const b = (a + 1 + rng.int(0, n - 2)) % n;
        if (pinnedIds.includes(a) || pinnedIds.includes(b)) continue;
        const ax = best[a].x,
          ay = best[a].y;
        best[a].x = best[a].initialX = best[b].x;
        best[a].y = best[a].initialY = best[b].y;
        best[b].x = best[b].initialX = ax;
        best[b].y = best[b].initialY = ay;
      }
    }

    best.forEach((node) => {
      node.pinned = pinnedIds.includes(node.id);
    });
    this.nodes = best;

    // Static background stars (purely decorative, deterministic per seed)
    const skyRng = createRNG(`KNOT_SKY_${seedStr}`);
    this.skyStars = Array.from({ length: 36 }, () => ({
      x: skyRng.int(2, 98),
      y: skyRng.int(2, 98),
      r: 0.25 + skyRng.int(0, 5) * 0.12,
      d: skyRng.int(0, 40) / 10,
    }));
  }

  // Scatter stars, join them shortest-first wherever a thread crosses nothing (a planar
  // triangulation), then thin the threads out while keeping every star connected.
  generateConstellation(rng, n) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 60; tries++) {
          const x = rng.int(14, 86);
          const y = rng.int(14, 86);
          if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= STAR_SPREAD_GAP)) {
            pts.push({ x, y });
            break;
          }
        }
      }
      if (pts.length < n) continue;

      const pairs = [];
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) pairs.push([i, j]);
      const len = ([i, j]) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      pairs.sort((p, q) => len(p) - len(q));

      const edges = [];
      for (const [i, j] of pairs) {
        if (!this.threadBlocked(pts, edges, i, j)) edges.push([i, j]);
      }

      const degree = Array(n).fill(0);
      edges.forEach(([u, v]) => {
        degree[u]++;
        degree[v]++;
      });

      // Thin out: drop threads (never leaving a star with fewer than two) while still connected
      const target = Math.round(n * THREADS_PER_STAR);
      for (const e of rng.shuffle(edges.slice())) {
        if (edges.length <= target) break;
        const [u, v] = e;
        if (degree[u] <= 2 || degree[v] <= 2) continue;
        const rest = edges.filter((x) => x !== e);
        if (!this.isConnected(n, rest)) continue;
        edges.splice(edges.indexOf(e), 1);
        degree[u]--;
        degree[v]--;
      }

      if (this.isConnected(n, edges) && degree.every((d) => d >= 2)) {
        return this.makeConstellation(rng, pts, edges, degree);
      }
    }

    // Last resort: a plain ring is always planar
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return {
        x: Math.round(50 + 34 * Math.cos(a)),
        y: Math.round(50 + 34 * Math.sin(a)),
      };
    });
    const edges = ring.map((_, i) => [i, (i + 1) % n]);
    return this.makeConstellation(rng, ring, edges, Array(n).fill(2));
  }

  makeConstellation(rng, pts, edges, degree) {
    // Pin the best-connected star, and the star farthest from it, so the player has two fixed
    // points that settle the scale and orientation of the figure
    const top = Math.max(...degree);
    const first = rng.pick(
      degree.map((d, id) => (d === top ? id : -1)).filter((id) => id >= 0),
    );
    let second = first === 0 ? 1 : 0;
    pts.forEach((p, id) => {
      const dist = (q) => Math.hypot(q.x - pts[first].x, q.y - pts[first].y);
      if (id !== first && dist(p) > dist(pts[second])) second = id;
    });
    const pinned = [first, second];
    const name = `The ${rng.pick(NAME_ADJECTIVES)} ${rng.pick(NAME_NOUNS)}`;
    return {
      name,
      epilogue: rng.pick(EPILOGUES)(name),
      numNodes: pts.length,
      edges,
      solutionCoords: pts,
      pinned,
    };
  }

  // A new thread i–j may not cross an existing one, or graze a star it doesn't join
  threadBlocked(pts, edges, i, j) {
    const a = pts[i];
    const b = pts[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (let k = 0; k < pts.length; k++) {
      if (k === i || k === j) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((pts[k].x - a.x) * dx + (pts[k].y - a.y) * dy) / (dx * dx + dy * dy),
        ),
      );
      const dist = Math.hypot(pts[k].x - (a.x + t * dx), pts[k].y - (a.y + t * dy));
      if (dist < THREAD_CLEARANCE) return true;
    }
    return edges.some(([u, v]) => {
      if (u === i || u === j || v === i || v === j) return false;
      return this.segmentsIntersect(a, b, pts[u], pts[v]);
    });
  }

  isConnected(n, edges) {
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const cur = stack.pop();
      for (const [u, v] of edges) {
        const other = u === cur ? v : v === cur ? u : -1;
        if (other >= 0 && !seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    return seen.size === n;
  }

  // Convex outline of the finished constellation (Andrew's monotone chain)
  hullPoints() {
    const pts = this.nodes
      .map((p) => ({ x: p.x, y: p.y }))
      .sort((p, q) => p.x - q.x || p.y - q.y);
    const half = (list) => {
      const out = [];
      for (const p of list) {
        while (
          out.length >= 2 &&
          this.ccw(out[out.length - 2], out[out.length - 1], p) <= 0
        )
          out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };
    return half(pts).concat(half([...pts].reverse()));
  }

  countIntersections(nodes, edges) {
    let count = 0;
    for (let i = 0; i < edges.length; i++) {
      const e1 = edges[i];
      for (let j = i + 1; j < edges.length; j++) {
        const e2 = edges[j];
        if (
          e1[0] === e2[0] ||
          e1[0] === e2[1] ||
          e1[1] === e2[0] ||
          e1[1] === e2[1]
        )
          continue;
        if (
          this.segmentsIntersect(
            nodes[e1[0]],
            nodes[e1[1]],
            nodes[e2[0]],
            nodes[e2[1]],
          )
        )
          count++;
      }
    }
    return count;
  }

  computeIntersections() {
    const list = [];
    for (let i = 0; i < this.edges.length; i++) {
      const e1 = this.edges[i];
      const a = this.nodes[e1[0]];
      const b = this.nodes[e1[1]];
      for (let j = i + 1; j < this.edges.length; j++) {
        const e2 = this.edges[j];
        if (
          e1[0] === e2[0] ||
          e1[0] === e2[1] ||
          e1[1] === e2[0] ||
          e1[1] === e2[1]
        )
          continue;
        const pt = this.getIntersectionPoint(
          a,
          b,
          this.nodes[e2[0]],
          this.nodes[e2[1]],
        );
        if (pt) list.push({ ...pt, e1Index: i, e2Index: j });
      }
    }
    this.intersections = list;
    return list;
  }

  ccw(p1, p2, p3) {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  }

  segmentsIntersect(a, b, c, d) {
    const ccw1 = this.ccw(a, b, c);
    const ccw2 = this.ccw(a, b, d);
    const ccw3 = this.ccw(c, d, a);
    const ccw4 = this.ccw(c, d, b);
    return (
      ((ccw1 > 0 && ccw2 < 0) || (ccw1 < 0 && ccw2 > 0)) &&
      ((ccw3 > 0 && ccw4 < 0) || (ccw3 < 0 && ccw4 > 0))
    );
  }

  getIntersectionPoint(a, b, c, d) {
    const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(denom) < 0.0001) return null;
    const numA = (c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x);
    const numB = (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
    const t = numA / denom;
    const u = numB / denom;
    if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) {
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
    return null;
  }

  // ------------------------------------------------------------------ interaction

  handlePointerDown(e, nodeId) {
    if (this.solved) return;
    e.preventDefault();
    if (this.nodes[nodeId].pinned) {
      sound.playClick(300, 0.02);
      return;
    }

    const svgEl = this.container.querySelector("#knot-svg-stage");
    if (!svgEl) return;
    this.svgRect = svgEl.getBoundingClientRect();

    this.draggedNodeId = nodeId;
    this.hintNodeId = null;
    this.setFocus(nodeId);
    const node = this.nodes[nodeId];

    const clickX = ((e.clientX - this.svgRect.left) / this.svgRect.width) * 100;
    const clickY = ((e.clientY - this.svgRect.top) / this.svgRect.height) * 100;
    this.dragOffset = { x: node.x - clickX, y: node.y - clickY };

    this.container
      .querySelector(`#knot-node-${nodeId}`)
      ?.classList.add("is-held");

    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);

    sound.playClick(420, 0.02);
  }

  // Light up one star's threads and neighbours (and quiet the rest) so its connections are easy to follow
  setFocus(id) {
    const stage = this.container.querySelector("#knot-svg-stage");
    if (!stage) return;
    if (this.solved) id = null;
    stage.classList.toggle("has-focus", id !== null);

    const neighbors = new Set();
    this.edges.forEach((e, idx) => {
      const incident = id !== null && (e[0] === id || e[1] === id);
      if (incident) neighbors.add(e[0] === id ? e[1] : e[0]);
      stage.querySelector(`#knot-edge-${idx}`)?.classList.toggle("is-focus", incident);
    });
    this.nodes.forEach((n) => {
      const g = stage.querySelector(`#knot-node-${n.id}`);
      g?.classList.toggle("is-focused", n.id === id);
      g?.classList.toggle("is-neighbor", neighbors.has(n.id));
    });
  }

  tooCloseToOther(id, x, y) {
    return this.nodes.some(
      (o) => o.id !== id && Math.hypot(o.x - x, o.y - y) < MIN_STAR_GAP,
    );
  }

  handlePointerMove(e) {
    if (this.draggedNodeId === null || !this.svgRect) return;
    e.preventDefault();

    const rawX =
      ((e.clientX - this.svgRect.left) / this.svgRect.width) * 100 +
      this.dragOffset.x;
    const rawY =
      ((e.clientY - this.svgRect.top) / this.svgRect.height) * 100 +
      this.dragOffset.y;

    const clampedX = Math.max(8, Math.min(92, rawX));
    const clampedY = Math.max(8, Math.min(92, rawY));

    const node = this.nodes[this.draggedNodeId];
    // Stars glide around each other instead of overlapping
    if (!this.tooCloseToOther(node.id, clampedX, clampedY)) {
      node.x = clampedX;
      node.y = clampedY;
    } else if (!this.tooCloseToOther(node.id, clampedX, node.y)) {
      node.x = clampedX;
    } else if (!this.tooCloseToOther(node.id, node.x, clampedY)) {
      node.y = clampedY;
    }

    this.computeIntersections();
    const currCount = this.intersections.length;

    if (currCount < this.lastIntersectionCount) sound.playKnotRelief(currCount);
    else if (currCount > this.lastIntersectionCount)
      sound.playKnotHum(currCount);
    this.lastIntersectionCount = currCount;

    this.updateSVGPositions();

    if (currCount === 0 && !this.solved) this.handleWin();
  }

  handlePointerUp() {
    if (this.draggedNodeId === null) return;
    const id = this.draggedNodeId;
    this.draggedNodeId = null;
    this.moves++;
    this.setFocus(null);

    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);

    this.container
      .querySelector(`#knot-node-${id}`)
      ?.classList.remove("is-held");

    this.computeIntersections();
    this.updateSVGPositions();

    if (this.intersections.length === 0 && !this.solved) this.handleWin();
  }

  handleWin() {
    this.solved = true;
    if (this.draggedNodeId !== null) {
      this.draggedNodeId = null;
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerUp);
    }
    sound.playKnotLock();
    setTimeout(() => sound.playVictory(), 280);

    this.render();

    if (this.onWin) setTimeout(() => this.onWin(this.getShareSummary()), 1100);
  }

  // ------------------------------------------------------------------ in-place updates

  starPath(r) {
    // four-point sparkle star
    const s = r * 1.9;
    const i = r * 0.55;
    return `M0 ${-s} L${i} ${-i} L${s} 0 L${i} ${i} L0 ${s} L${-i} ${i} L${-s} 0 L${-i} ${-i} Z`;
  }

  hazeOpacity() {
    if (this.solved) return 0;
    return Math.min(
      0.28,
      0.28 * (this.intersections.length / this.initialCrossings),
    );
  }

  updateSVGPositions() {
    const stage = this.container.querySelector("#knot-svg-stage");
    if (!stage) return;

    const crossingEdges = new Set();
    this.intersections.forEach((pt) => {
      crossingEdges.add(pt.e1Index);
      crossingEdges.add(pt.e2Index);
    });

    this.edges.forEach((edge, idx) => {
      const u = this.nodes[edge[0]];
      const v = this.nodes[edge[1]];
      const lineEl = stage.querySelector(`#knot-edge-${idx}`);
      if (lineEl) {
        lineEl.setAttribute("x1", u.x);
        lineEl.setAttribute("y1", u.y);
        lineEl.setAttribute("x2", v.x);
        lineEl.setAttribute("y2", v.y);
        lineEl.classList.toggle("is-tangled", crossingEdges.has(idx));
      }
    });

    this.nodes.forEach((node) => {
      const gEl = stage.querySelector(`#knot-node-${node.id}`);
      if (gEl) {
        gEl.setAttribute("transform", `translate(${node.x}, ${node.y})`);
        const tangled = this.edges.some(
          (e, idx) =>
            crossingEdges.has(idx) && (e[0] === node.id || e[1] === node.id),
        );
        gEl.classList.toggle("is-tangled", tangled);
      }
    });

    const pipsGroup = stage.querySelector("#knot-intersections-group");
    if (pipsGroup) pipsGroup.innerHTML = this.intersectionsHtml();

    const haze = stage.querySelector("#knot-haze");
    if (haze) haze.setAttribute("opacity", this.hazeOpacity().toFixed(3));

    const countEl = this.container.querySelector("#knot-count-val");
    if (countEl) {
      countEl.innerHTML = `${this.intersections.length} <span style="font-size:12px;opacity:0.7;">crossings</span>`;
      countEl.className = `hud-value ${this.intersections.length === 0 ? "ok" : ""}`;
    }

    const statusPill = this.container.querySelector("#knot-status-pill");
    if (statusPill) {
      statusPill.innerHTML = this.statusText();
      statusPill.className = `status-pill ${this.intersections.length === 0 ? "solved" : "error"}`;
    }

    const clarity = this.container.querySelector("#knot-clarity-fill");
    if (clarity) {
      const pct = this.solved
        ? 100
        : Math.round(
            100 *
              (1 -
                Math.min(1, this.intersections.length / this.initialCrossings)),
          );
      clarity.style.width = `${pct}%`;
    }
  }

  statusText() {
    if (this.intersections.length === 0) return `${ico("check")} The sky is clear`;
    if (this.intersections.length <= 2) return "The haze is thinning";
    return "Threads cross in the haze";
  }

  intersectionsHtml() {
    return this.intersections
      .map(
        (pt) => `
      <circle cx="${pt.x}" cy="${pt.y}" r="1.6" class="knot-intersect-dot" />
      <circle cx="${pt.x}" cy="${pt.y}" r="4" class="knot-intersect-pulse" />
    `,
      )
      .join("");
  }

  // ------------------------------------------------------------------ hint / reset

  giveHint() {
    if (this.solved || this.intersections.length === 0) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // The star tangled in the most crossings
    const scores = Array(this.nodes.length).fill(0);
    this.intersections.forEach((pt) => {
      this.edges[pt.e1Index].forEach((id) => scores[id]++);
      this.edges[pt.e2Index].forEach((id) => scores[id]++);
    });
    this.nodes.forEach((n) => {
      if (n.pinned) scores[n.id] = -1;
    });
    let worst = this.nodes.findIndex((n) => !n.pinned);
    scores.forEach((s, id) => {
      if (s > scores[worst]) worst = id;
    });

    const node = this.nodes[worst];
    const nx = Math.round(node.x * 0.5 + node.solX * 0.5);
    const ny = Math.round(node.y * 0.5 + node.solY * 0.5);
    if (!this.tooCloseToOther(node.id, nx, ny)) {
      node.x = nx;
      node.y = ny;
    }
    this.hintNodeId = worst;

    this.moves++;
    sound.playKnotRelief(this.intersections.length);
    this.computeIntersections();
    this.lastIntersectionCount = this.intersections.length;
    this.render();

    if (this.intersections.length === 0 && !this.solved) this.handleWin();
  }

  resetPuzzle() {
    if (this.solved) return;
    sound.playClick(320);
    this.nodes.forEach((n) => {
      n.x = n.initialX;
      n.y = n.initialY;
    });
    this.hintNodeId = null;
    this.computeIntersections();
    this.lastIntersectionCount = this.intersections.length;
    this.render();
  }

  destroy() {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
  }

  getShareSummary() {
    const elapsedSec = Math.max(
      1,
      Math.round((Date.now() - this.startTime) / 1000),
    );
    const visualCells = this.nodes.map(() => "active");
    const n = this.nodes.length;
    const gridCols = n <= 5 ? n : Math.ceil(n / 2);

    const threads = this.edges
      .map((e) => {
        const u = this.nodes[e[0]];
        const v = this.nodes[e[1]];
        return `<line x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" stroke="#ffd978" stroke-opacity="0.8" stroke-width="1.1" stroke-linecap="round" />`;
      })
      .join("");
    const stars = this.nodes
      .map(
        (p) =>
          `<circle cx="${p.x}" cy="${p.y}" r="3.6" fill="#ffd978" fill-opacity="0.18" /><circle cx="${p.x}" cy="${p.y}" r="1.9" fill="#fff6e4" />`,
      )
      .join("");
    const visualSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${threads}${stars}</svg>`;

    return {
      gameName: "KNOT",
      subtitle: `${this.template.name}: ${this.nodes.length} stars freed`,
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: "time",
      stat1Value: `${elapsedSec}s`,
      stat2Label: "moves",
      stat2Value: `${this.moves}`,
      stat3Label: "crossings",
      stat3Value: "0",
      gridCols,
      visualCells,
      visualSvg,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • knot (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n✦ ${this.template.name}: 0 crossings`,
    };
  }

  // ------------------------------------------------------------------ rendering

  render() {
    const isCooldown =
      this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown
      ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000)
      : 0;

    const crossingEdges = new Set();
    this.intersections.forEach((pt) => {
      crossingEdges.add(pt.e1Index);
      crossingEdges.add(pt.e2Index);
    });

    const skyHtml = this.skyStars
      .map(
        (s) =>
          `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" class="knot-sky-star" style="animation-delay:${s.d}s" />`,
      )
      .join("");

    const edgesHtml = this.edges
      .map((e, idx) => {
        const u = this.nodes[e[0]];
        const v = this.nodes[e[1]];
        return `<line id="knot-edge-${idx}" x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" class="knot-thread ${crossingEdges.has(idx) ? "is-tangled" : ""}" />`;
      })
      .join("");

    const degree = (id) =>
      this.edges.filter((e) => e[0] === id || e[1] === id).length;

    const nodesHtml = this.nodes
      .map((n) => {
        const r = 2.6 + Math.min(4, degree(n.id)) * 0.35;
        const tangled = this.edges.some(
          (e, idx) =>
            crossingEdges.has(idx) && (e[0] === n.id || e[1] === n.id),
        );
        return `
      <g id="knot-node-${n.id}" class="knot-star-group ${tangled ? "is-tangled" : ""} ${this.hintNodeId === n.id ? "is-hinted" : ""} ${n.pinned ? "is-pinned" : ""}"
         transform="translate(${n.x}, ${n.y})" data-node-id="${n.id}">
        <circle r="8" class="knot-node-touch-target" />
        <circle r="${r * 2.3}" class="knot-star-halo" />
        <path d="${this.starPath(r)}" class="knot-star-body" />
        <circle r="${r * 0.38}" class="knot-star-core" />
        ${n.pinned ? `<circle r="${r * 1.7}" class="knot-pin-ring" />` : ""}
      </g>`;
      })
      .join("");

    const clarityPct = this.solved
      ? 100
      : Math.round(
          100 *
            (1 -
              Math.min(1, this.intersections.length / this.initialCrossings)),
        );

    this.container.innerHTML = `
      <div class="game-panel knot-panel ${this.solved ? "is-solved" : ""}">
        <div class="knot-hud">
          <div class="hud-card">
            <span class="hud-label">crossing threads</span>
            <div id="knot-count-val" class="hud-value ${this.intersections.length === 0 ? "ok" : ""}">
              ${this.intersections.length} <span style="font-size:12px;opacity:0.7;">crossings</span>
            </div>
          </div>

          <div class="hud-card" style="text-align: center;">
            <span class="hud-label">the night sky</span>
            <div id="knot-status-pill" class="status-pill ${this.solved ? "solved" : "error"}">${this.statusText()}</div>
          </div>

          <div class="hud-card" style="text-align: right;">
            <span class="hud-label">stars moved</span>
            <div class="hud-value">${this.moves} <span style="font-size:12px;opacity:0.7;">moves</span></div>
          </div>
        </div>

        <div class="knot-clarity" title="How clear the sky has become">
          <span class="knot-clarity-label">haze</span>
          <div class="knot-clarity-track"><div id="knot-clarity-fill" class="knot-clarity-fill" style="width:${clarityPct}%"></div></div>
          <span class="knot-clarity-label">clear</span>
        </div>

        <div class="knot-stage-wrapper">
          <div class="knot-canvas-container ${this.solved ? "is-clear" : ""}">
            <svg id="knot-svg-stage" class="knot-svg" viewBox="0 0 100 100">
              <defs>
                <radialGradient id="knot-haze-grad" cx="50%" cy="50%" r="75%">
                  <stop offset="0%" stop-color="#d8c8e8" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#b9a4d4" stop-opacity="0.6" />
                </radialGradient>
                <filter id="knot-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="0.9" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <g class="knot-sky">${skyHtml}</g>

              ${
                this.solved
                  ? `<polygon class="knot-outline" points="${this.hullPoints()
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}" />`
                  : ""
              }

              <g class="knot-edges-group" filter="url(#knot-glow)">${edgesHtml}</g>

              <rect id="knot-haze" class="knot-haze" x="0" y="0" width="100" height="100"
                    fill="url(#knot-haze-grad)" opacity="${this.hazeOpacity().toFixed(3)}" pointer-events="none" />

              <g id="knot-intersections-group" class="knot-intersections-group">${this.intersectionsHtml()}</g>

              <g class="knot-nodes-group" filter="url(#knot-glow)">${nodesHtml}</g>
            </svg>
            ${
              this.solved
                ? `
              <div class="knot-reveal">
                <div class="knot-reveal-name">${this.template.name}</div>
                <div class="knot-reveal-text">${this.template.epilogue}</div>
              </div>`
                : ""
            }
          </div>
        </div>

        <div class="action-btns" style="justify-content: space-between; align-items: center; margin-top: 4px;">
          <button id="knot-reset-btn" class="btn-secondary" title="Return the stars to where you found them">${ico("reset")}<span>start fresh</span></button>

          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); text-align: center;">
            touch a star to light its threads. Ringed stars stay in place.
          </div>

          <button id="knot-hint-btn" class="btn-secondary btn-hint ${isCooldown ? "cooldown-active" : ""}"
                  style="--cooldown-dur: ${remSec}s" ${isCooldown ? "disabled" : ""}>
            <span class="btn-text">hint (${this.hintsUsed})</span>
            <span class="btn-cooldown-wipe"></span>
          </button>
        </div>
      </div>
    `;

    this.container.querySelectorAll(".knot-star-group").forEach((el) => {
      const id = parseInt(el.dataset.nodeId, 10);
      el.addEventListener("pointerdown", (e) => this.handlePointerDown(e, id));
      el.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse" && this.draggedNodeId === null) this.setFocus(id);
      });
      el.addEventListener("pointerleave", () => {
        if (this.draggedNodeId === null) this.setFocus(null);
      });
    });

    this.container
      .querySelector("#knot-hint-btn")
      ?.addEventListener("click", () => this.giveHint());
    this.container
      .querySelector("#knot-reset-btn")
      ?.addEventListener("click", () => this.resetPuzzle());

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector("#knot-hint-btn");
        if (btn) {
          btn.classList.remove("cooldown-active");
          btn.removeAttribute("disabled");
        }
      }, remSec * 1000);
    }
  }
}
