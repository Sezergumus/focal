// MODÜL 06 — KNOT (Topological Signal & Noise Elimination Laboratory)
// Untangle the planar graph until 0 lines intersect.

import { createRNG } from './rng.js';
import { sound } from './audio.js';

// Pre-verified planar graph topologies with guaranteed 0-crossing embeddings
const PLANAR_TEMPLATES = [
  // Template 1: 6 nodes, 9 edges (dual nested triangles)
  {
    numNodes: 6,
    edges: [[0,1], [1,2], [2,0], [0,3], [1,4], [2,5], [3,4], [4,5], [5,3]],
    solutionCoords: [
      { x: 50, y: 35 }, { x: 38, y: 62 }, { x: 62, y: 62 },
      { x: 50, y: 12 }, { x: 18, y: 84 }, { x: 82, y: 84 }
    ]
  },
  // Template 2: 7 nodes, 12 edges (W6 wheel: 6 outer hexagon + 1 center)
  {
    numNodes: 7,
    edges: [
      [0,1], [1,2], [2,3], [3,4], [4,5], [5,0],
      [6,0], [6,1], [6,2], [6,3], [6,4], [6,5]
    ],
    solutionCoords: [
      { x: 50, y: 15 }, { x: 82, y: 32 }, { x: 82, y: 68 },
      { x: 50, y: 85 }, { x: 18, y: 68 }, { x: 18, y: 32 },
      { x: 50, y: 50 }
    ]
  },
  // Template 3: 7 nodes, 12 edges (triangulated mesh)
  {
    numNodes: 7,
    edges: [
      [0,1], [1,2], [2,3], [3,4], [4,0], // outer cycle
      [5,0], [5,1], [5,4], // inner node 1
      [6,1], [6,2], [6,3], [6,5] // inner node 2
    ],
    solutionCoords: [
      { x: 50, y: 14 }, { x: 85, y: 38 }, { x: 72, y: 82 },
      { x: 28, y: 82 }, { x: 15, y: 38 }, { x: 38, y: 45 },
      { x: 60, y: 55 }
    ]
  },
  // Template 4: 8 nodes, 13 edges
  {
    numNodes: 8,
    edges: [
      [0,1], [1,2], [2,3], [3,4], [4,5], [5,0], // outer hexagon
      [6,0], [6,1], [6,5],
      [7,2], [7,3], [7,4],
      [6,7]
    ],
    solutionCoords: [
      { x: 30, y: 15 }, { x: 70, y: 15 }, { x: 86, y: 50 },
      { x: 70, y: 85 }, { x: 30, y: 85 }, { x: 14, y: 50 },
      { x: 42, y: 40 }, { x: 58, y: 60 }
    ]
  },
  // Template 5: 8 nodes, 15 edges (Dual Core 8-vertex planar triangulation)
  {
    numNodes: 8,
    edges: [
      [0,1], [1,2], [2,3], [3,4], [4,5], [5,0],
      [6,0], [6,5], [6,4], [6,3],
      [7,0], [7,1], [7,2], [7,3],
      [6,7]
    ],
    solutionCoords: [
      { x: 50, y: 15 }, { x: 84, y: 32 }, { x: 84, y: 68 },
      { x: 50, y: 85 }, { x: 16, y: 68 }, { x: 16, y: 32 },
      { x: 38, y: 50 }, { x: 62, y: 50 }
    ]
  }
];

export class KnotGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = '';
    this.nodes = []; // { id, x, y, solX, solY, initialX, initialY }
    this.edges = []; // [u, v]
    this.intersections = []; // { x, y, edge1, edge2 }
    this.lastIntersectionCount = 0;

    this.draggedNodeId = null;
    this.dragOffset = { x: 0, y: 0 };
    this.svgRect = null;

    this.moves = 0;
    this.hintsUsed = 0;
    this.startTime = 0;
    this.solved = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.humInterval = null;

    // Bound listeners for pointer drag
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
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;

    this.generatePuzzle(seedStr);
    this.computeIntersections();
    this.lastIntersectionCount = this.intersections.length;

    this.render();
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`KNOT_V1_${seedStr}`);

    // Pick template
    const templateIdx = rng.int(0, PLANAR_TEMPLATES.length - 1);
    const tmpl = PLANAR_TEMPLATES[templateIdx];

    this.edges = tmpl.edges.map(e => [...e]);
    const n = tmpl.numNodes;

    // Scramble node positions around an ellipse/circle or randomized points
    // Guarantee 4 to 9 initial intersections
    let bestScramble = null;
    let bestCrossings = 0;

    for (let attempt = 0; attempt < 40; attempt++) {
      const order = rng.shuffle([...Array(n).keys()]);
      const candidateNodes = [];

      for (let i = 0; i < n; i++) {
        // Place in circle with randomized order
        const angle = (2 * Math.PI * i) / n + (rng.next() * 0.3 - 0.15);
        const radius = 33 + rng.int(-5, 6);
        const x = Math.round(50 + radius * Math.cos(angle));
        const y = Math.round(50 + radius * Math.sin(angle));

        const originalNodeId = order[i];
        candidateNodes[originalNodeId] = {
          id: originalNodeId,
          x: Math.max(12, Math.min(88, x)),
          y: Math.max(12, Math.min(88, y)),
          solX: tmpl.solutionCoords[originalNodeId].x,
          solY: tmpl.solutionCoords[originalNodeId].y,
          initialX: x,
          initialY: y
        };
      }

      const crossings = this.countIntersections(candidateNodes, this.edges);
      if (crossings >= 4 && crossings <= 9) {
        bestScramble = candidateNodes;
        bestCrossings = crossings;
        break;
      }
      if (crossings > bestCrossings) {
        bestScramble = candidateNodes;
        bestCrossings = crossings;
      }
    }

    this.nodes = bestScramble;
  }

  countIntersections(nodes, edges) {
    let count = 0;
    const numEdges = edges.length;
    for (let i = 0; i < numEdges; i++) {
      const e1 = edges[i];
      const a = nodes[e1[0]];
      const b = nodes[e1[1]];
      for (let j = i + 1; j < numEdges; j++) {
        const e2 = edges[j];
        // Skip edges that share a vertex
        if (e1[0] === e2[0] || e1[0] === e2[1] || e1[1] === e2[0] || e1[1] === e2[1]) continue;

        const c = nodes[e2[0]];
        const d = nodes[e2[1]];

        if (this.segmentsIntersect(a, b, c, d)) {
          count++;
        }
      }
    }
    return count;
  }

  computeIntersections() {
    const list = [];
    const numEdges = this.edges.length;

    for (let i = 0; i < numEdges; i++) {
      const e1 = this.edges[i];
      const a = this.nodes[e1[0]];
      const b = this.nodes[e1[1]];

      for (let j = i + 1; j < numEdges; j++) {
        const e2 = this.edges[j];
        if (e1[0] === e2[0] || e1[0] === e2[1] || e1[1] === e2[0] || e1[1] === e2[1]) continue;

        const c = this.nodes[e2[0]];
        const d = this.nodes[e2[1]];

        const pt = this.getIntersectionPoint(a, b, c, d);
        if (pt) {
          list.push({ ...pt, e1Index: i, e2Index: j });
        }
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

    // Strict intersection
    if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) {
      return {
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y)
      };
    }
    return null;
  }

  handlePointerDown(e, nodeId) {
    if (this.solved) return;
    e.preventDefault();

    const svgEl = this.container.querySelector('#knot-svg-stage');
    if (!svgEl) return;
    this.svgRect = svgEl.getBoundingClientRect();

    this.draggedNodeId = nodeId;
    const node = this.nodes[nodeId];

    // Convert mouse client coord to SVG 0-100% space
    const clickX = ((e.clientX - this.svgRect.left) / this.svgRect.width) * 100;
    const clickY = ((e.clientY - this.svgRect.top) / this.svgRect.height) * 100;

    this.dragOffset = {
      x: node.x - clickX,
      y: node.y - clickY
    };

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    sound.playClick(420, 0.02);
  }

  handlePointerMove(e) {
    if (this.draggedNodeId === null || !this.svgRect) return;
    e.preventDefault();

    const clientX = e.clientX;
    const clientY = e.clientY;

    const rawX = ((clientX - this.svgRect.left) / this.svgRect.width) * 100 + this.dragOffset.x;
    const rawY = ((clientY - this.svgRect.top) / this.svgRect.height) * 100 + this.dragOffset.y;

    // Clamp inside board bounds
    const clampedX = Math.max(8, Math.min(92, rawX));
    const clampedY = Math.max(8, Math.min(92, rawY));

    const node = this.nodes[this.draggedNodeId];
    node.x = clampedX;
    node.y = clampedY;

    this.computeIntersections();
    const currCount = this.intersections.length;

    // Sound feedback on crossing reduction
    if (currCount < this.lastIntersectionCount) {
      sound.playKnotRelief(currCount);
    } else if (currCount > this.lastIntersectionCount) {
      sound.playKnotHum(currCount);
    }
    this.lastIntersectionCount = currCount;

    this.updateSVGPositions();

    // Check win condition: exactly 0 intersections!
    if (currCount === 0 && !this.solved) {
      this.handleWin();
    }
  }

  handlePointerUp(e) {
    if (this.draggedNodeId === null) return;
    this.draggedNodeId = null;
    this.moves++;

    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);

    this.computeIntersections();
    this.render();

    if (this.intersections.length === 0 && !this.solved) {
      this.handleWin();
    }
  }

  handleWin() {
    this.solved = true;
    sound.playKnotLock();
    setTimeout(() => sound.playVictory(), 280);

    this.render();

    if (this.onWin) {
      setTimeout(() => this.onWin(this.getShareSummary()), 520);
    }
  }

  updateSVGPositions() {
    // Fast in-place DOM updates for smooth 60fps drag
    const stage = this.container.querySelector('#knot-svg-stage');
    if (!stage) return;

    // Update edges
    this.edges.forEach((edge, idx) => {
      const u = this.nodes[edge[0]];
      const v = this.nodes[edge[1]];
      const lineEl = stage.querySelector(`#knot-edge-${idx}`);
      if (lineEl) {
        lineEl.setAttribute('x1', u.x);
        lineEl.setAttribute('y1', u.y);
        lineEl.setAttribute('x2', v.x);
        lineEl.setAttribute('y2', v.y);
      }
    });

    // Update nodes
    this.nodes.forEach(node => {
      const gEl = stage.querySelector(`#knot-node-${node.id}`);
      if (gEl) {
        gEl.setAttribute('transform', `translate(${node.x}, ${node.y})`);
      }
    });

    // Update intersection points
    const pipsGroup = stage.querySelector('#knot-intersections-group');
    if (pipsGroup) {
      pipsGroup.innerHTML = this.intersections.map(pt => `
        <circle cx="${pt.x}" cy="${pt.y}" r="2" class="knot-intersect-dot" />
        <circle cx="${pt.x}" cy="${pt.y}" r="4.5" class="knot-intersect-pulse" />
      `).join('');
    }

    // Update counter
    const countEl = this.container.querySelector('#knot-count-val');
    if (countEl) {
      countEl.textContent = `${this.intersections.length}`;
      countEl.className = `hud-value ${this.intersections.length === 0 ? 'ok' : ''}`;
    }

    const statusPill = this.container.querySelector('#knot-status-pill');
    if (statusPill) {
      statusPill.textContent = this.intersections.length === 0 ? '✓ ZERO NOISE LOCKED' : 'SIGNAL CROSSINGS DETECTED';
      statusPill.className = `status-pill ${this.intersections.length === 0 ? 'solved' : 'error'}`;
    }
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // Find the node involved in the highest number of edge crossings
    const nodeCrossingScores = Array(this.nodes.length).fill(0);
    this.intersections.forEach(pt => {
      const e1 = this.edges[pt.e1Index];
      const e2 = this.edges[pt.e2Index];
      nodeCrossingScores[e1[0]]++;
      nodeCrossingScores[e1[1]]++;
      nodeCrossingScores[e2[0]]++;
      nodeCrossingScores[e2[1]]++;
    });

    let worstNodeId = 0;
    let maxCrossings = -1;
    nodeCrossingScores.forEach((score, id) => {
      if (score > maxCrossings) {
        maxCrossings = score;
        worstNodeId = id;
      }
    });

    // Smoothly shift worst node 45% closer to its known planar solution
    const node = this.nodes[worstNodeId];
    node.x = Math.round(node.x * 0.55 + node.solX * 0.45);
    node.y = Math.round(node.y * 0.55 + node.solY * 0.45);

    this.moves++;
    sound.playKnotRelief(this.intersections.length);
    this.computeIntersections();
    this.render();

    if (this.intersections.length === 0 && !this.solved) {
      this.handleWin();
    }
  }

  resetPuzzle() {
    if (this.solved) return;
    sound.playClick(320);
    this.nodes.forEach(n => {
      n.x = n.initialX;
      n.y = n.initialY;
    });
    this.computeIntersections();
    this.render();
  }

  destroy() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    this.hintCooldownTimer = null;
  }

  getShareSummary() {
    const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const visualCells = this.nodes.map(n => ({ type: 'emerald', label: '●' }));

    return {
      gameName: 'KNOT',
      subtitle: `0 intersections • ${this.nodes.length} nodes planarized`,
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: 'time',
      stat1Value: `${elapsedSec}s`,
      stat2Label: 'moves',
      stat2Value: `${this.moves}`,
      stat3Label: 'crossings',
      stat3Value: '0',
      gridCols: Math.min(4, this.nodes.length),
      visualCells,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • knot (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n◎ topology untangled: 0 crossings`
    };
  }

  render() {
    const isCooldown = this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000) : 0;

    // SVG elements
    const edgesHtml = this.edges.map((e, idx) => {
      const u = this.nodes[e[0]];
      const v = this.nodes[e[1]];
      return `<line id="knot-edge-${idx}" x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" class="knot-edge-line" />`;
    }).join('');

    const intersectionsHtml = this.intersections.map(pt => `
      <circle cx="${pt.x}" cy="${pt.y}" r="2" class="knot-intersect-dot" />
      <circle cx="${pt.x}" cy="${pt.y}" r="4.5" class="knot-intersect-pulse" />
    `).join('');

    const nodesHtml = this.nodes.map(n => `
      <g id="knot-node-${n.id}" class="knot-node-group" transform="translate(${n.x}, ${n.y})" data-node-id="${n.id}">
        <circle r="7.5" class="knot-node-touch-target" />
        <circle r="4.5" class="knot-node-outer" />
        <circle r="2" class="knot-node-inner" />
      </g>
    `).join('');

    this.container.innerHTML = `
      <div class="game-panel knot-panel ${this.solved ? 'is-solved' : ''}">
        <!-- Top HUD -->
        <div class="knot-hud">
          <div class="hud-card">
            <span class="hud-label">crossings</span>
            <div id="knot-count-val" class="hud-value ${this.intersections.length === 0 ? 'ok' : ''}">
              ${this.intersections.length} <span style="font-size:12px;opacity:0.7;">intersections</span>
            </div>
          </div>

          <div class="hud-card" style="text-align: center;">
            <span class="hud-label">topology health</span>
            <div id="knot-status-pill" class="status-pill ${this.solved ? 'solved' : 'error'}">
              ${this.solved ? '✓ ZERO NOISE LOCKED' : 'SIGNAL CROSSINGS DETECTED'}
            </div>
          </div>

          <div class="hud-card" style="text-align: right;">
            <span class="hud-label">adjustments</span>
            <div class="hud-value">${this.moves} <span style="font-size:12px;opacity:0.7;">moves</span></div>
          </div>
        </div>

        <!-- Interactive SVG Stage -->
        <div class="knot-stage-wrapper">
          <div class="knot-canvas-container">
            <svg id="knot-svg-stage" class="knot-svg" viewBox="0 0 100 100">
              <defs>
                <filter id="knot-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <!-- Edges -->
              <g class="knot-edges-group">
                ${edgesHtml}
              </g>

              <!-- Intersection Error Markers -->
              <g id="knot-intersections-group" class="knot-intersections-group">
                ${intersectionsHtml}
              </g>

              <!-- Draggable Nodes -->
              <g class="knot-nodes-group">
                ${nodesHtml}
              </g>
            </svg>
          </div>
        </div>

        <!-- Bottom Controls -->
        <div class="action-btns" style="justify-content: space-between; align-items: center; margin-top: 4px;">
          <button id="knot-reset-btn" class="btn-secondary" title="Reset node positions">
            ↺ reset layout
          </button>

          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
            drag rings to untangle all crossing lines
          </div>

          <button id="knot-hint-btn" class="btn-secondary btn-hint ${isCooldown ? 'cooldown-active' : ''}"
                  style="--cooldown-dur: ${remSec}s" ${isCooldown ? 'disabled' : ''}>
            <span class="btn-text">💡 hint (${this.hintsUsed})</span>
            <span class="btn-cooldown-wipe"></span>
          </button>
        </div>
      </div>
    `;

    // Attach pointer listeners to nodes
    this.container.querySelectorAll('.knot-node-group').forEach(el => {
      const id = parseInt(el.dataset.nodeId, 10);
      el.addEventListener('pointerdown', (e) => this.handlePointerDown(e, id));
    });

    this.container.querySelector('#knot-hint-btn')?.addEventListener('click', () => this.giveHint());
    this.container.querySelector('#knot-reset-btn')?.addEventListener('click', () => this.resetPuzzle());

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector('#knot-hint-btn');
        if (btn) {
          btn.classList.remove('cooldown-active');
          btn.removeAttribute('disabled');
        }
      }, remSec * 1000);
    }
  }
}
