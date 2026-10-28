// INSTRUMENT 08 — SPECTRUM (Starlight & Melody)
// Seven glass vials of starlight each sing one hidden pitch. Order them from the lowest voice to the
// highest by ear alone.
//
// Difficulty design:
//  - Every seed draws 7 distinct pitches from a 14-semitone chromatic span, so neighbours can be a
//    single semitone apart and there is no familiar scale to lean on.
//  - Every vial is filled to the same level, and color/name are shuffled independently of pitch (and
//    rejected if they happen to correlate with it), so they are pure decoys. No note names or numbers are shown while playing.
//  - No anchors and no "in place" indicators: the only evidence is what you hear.

import { createRNG } from "./rng.js";
import { sound } from "./audio.js";
import { ico } from "./icons.js";

const PALETTE = [
  { name: "Dusk Violet", short: "Violet", color: "#a78bfa", core: "#ede9fe" },
  { name: "Midnight Indigo", short: "Indigo", color: "#818cf8", core: "#e0e7ff" },
  { name: "Sea-Mist Azure", short: "Azure", color: "#38bdf8", core: "#e0f2fe" },
  { name: "Harbor Cyan", short: "Cyan", color: "#2dd4bf", core: "#ccfbf1" },
  { name: "Meadow Emerald", short: "Emerald", color: "#4ade80", core: "#dcfce7" },
  { name: "Lantern Amber", short: "Amber", color: "#fbbf24", core: "#fef3c7" },
  { name: "Dawn Ruby", short: "Ruby", color: "#f87171", core: "#fee2e2" },
];

const BASE_FREQ = 261.63; // C4
const VIAL_COUNT = 7;
const SEMITONE_SPAN = 14;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Pearson correlation of two equal-length numeric arrays (0 if either is constant)
function correlation(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export class SpectrumGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = "";
    this.tubes = []; // array of 7 vial objects currently in slots 0..6
    this.initialTubes = []; // initial scrambled snapshot for reset
    this.selectedTubeIdx = null;
    this.lastSwappedPair = null; // [idxA, idxB]
    this.isPlayingSequence = false;
    this.activePlayingIdx = null;

    this.history = [];
    this.moves = 0;
    this.hintsUsed = 0;
    this.checksUsed = 0;
    this.startTime = 0;
    this.solved = false;
    this.hintMessage = null;
    this.hintHighlights = [];
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.sequenceTimer = null;
    this.pairTimer = null;
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.checksUsed = 0;
    this.solved = false;
    this.startTime = Date.now();
    this.selectedTubeIdx = null;
    this.lastSwappedPair = null;
    this.isPlayingSequence = false;
    this.activePlayingIdx = null;
    this.history = [];
    this.hintMessage = null;
    this.hintHighlights = [];
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (this.sequenceTimer) clearTimeout(this.sequenceTimer);
    if (this.pairTimer) clearTimeout(this.pairTimer);
    this.hintCooldownTimer = null;
    this.sequenceTimer = null;
    this.pairTimer = null;

    this.generatePuzzle(seedStr);
    this.render();
  }

  pushHistory() {
    this.history.push(this.tubes.map((t) => ({ ...t })));
    if (this.history.length > 50) this.history.shift();
  }

  undo() {
    if (this.solved || this.history.length === 0) return;
    sound.playClick(380);
    this.tubes = this.history.pop();
    this.selectedTubeIdx = null;
    this.lastSwappedPair = null;
    this.hintMessage = null;
    this.hintHighlights = [];
    this.render();
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`SPECTRUM_V2_${seedStr}`);
    const n = VIAL_COUNT;

    let tubes = [];
    let attempts = 0;
    let decoysClean = false;

    // Redraw until the color order carries no usable hint about pitch rank
    do {
      const semitones = rng
        .shuffle(Array.from({ length: SEMITONE_SPAN }, (_, i) => i))
        .slice(0, n)
        .sort((x, y) => x - y);
      const colors = rng.shuffle(PALETTE.map((_, i) => i));

      // vial i has pitch rank i here; it gets scrambled into the rack afterwards
      const ranked = semitones.map((semi, rank) => {
        const swatch = PALETTE[colors[rank]];
        return {
          id: rank,
          semitone: semi,
          audioFreq: BASE_FREQ * Math.pow(2, semi / 12),
          note: NOTE_NAMES[semi % 12] + (semi >= 12 ? "5" : "4"),
          name: swatch.name,
          short: swatch.short,
          color: swatch.color,
          core: swatch.core,
        };
      });

      const ranks = ranked.map((t) => t.id);
      const colorCorr = correlation(ranks, colors);
      decoysClean = Math.abs(colorCorr) < 0.35;
      tubes = ranked;
      attempts++;
    } while (!decoysClean && attempts < 50);

    // Scramble, forcing most vials off their target slot
    let scrambled = tubes;
    attempts = 0;
    do {
      scrambled = rng.shuffle(tubes);
      attempts++;
    } while (
      attempts < 50 &&
      scrambled.filter((t, idx) => t.id === idx).length > 1
    );

    this.tubes = scrambled;
    this.initialTubes = this.tubes.map((t) => ({ ...t }));
  }

  handleTubeClick(index) {
    if (this.solved) return;
    const clickedTube = this.tubes[index];

    this.activePlayingIdx = index;
    sound.playSpectrumTone(clickedTube.audioFreq, 0.35);

    if (this.selectedTubeIdx === null) {
      this.selectedTubeIdx = index;
      this.hintMessage = null;
      this.hintHighlights = [];
      this.render();
    } else if (this.selectedTubeIdx === index) {
      this.selectedTubeIdx = null;
      this.render();
    } else {
      const fromIdx = this.selectedTubeIdx;
      this.selectedTubeIdx = null;
      this.swapTubes(fromIdx, index);
    }
  }

  swapTubes(fromIdx, toIdx, isHint = false) {
    this.pushHistory();
    sound.playGlassClink();
    if (!isHint) {
      this.moves++;
      this.hintMessage = null;
      this.hintHighlights = [];
    }

    const temp = this.tubes[fromIdx];
    this.tubes[fromIdx] = this.tubes[toIdx];
    this.tubes[toIdx] = temp;
    this.lastSwappedPair = [fromIdx, toIdx];

    this.render();
    this.checkWinCondition();
  }

  checkWinCondition() {
    const isSorted = this.tubes.every((t, idx) => t.id === idx);

    if (isSorted && !this.solved) {
      this.solved = true;
      const notes = this.tubes.map((t) => t.audioFreq);
      sound.playSpectrumGlissando(notes);
      setTimeout(() => sound.playVictory(), 550);

      this.render();

      if (this.onWin) {
        setTimeout(() => this.onWin(this.getShareSummary()), 650);
      }
    }
  }

  playFullSequence() {
    if (this.isPlayingSequence) return;
    this.isPlayingSequence = true;
    let step = 0;

    const playNext = () => {
      if (step >= this.tubes.length) {
        this.isPlayingSequence = false;
        this.activePlayingIdx = null;
        this.render();
        return;
      }

      this.activePlayingIdx = step;
      const tube = this.tubes[step];
      sound.playSpectrumTone(tube.audioFreq, 0.28);
      this.render();

      step++;
      this.sequenceTimer = setTimeout(playNext, 195);
    };

    playNext();
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // Point at the first slot that holds the wrong vial and let the player make the swap:
    // play what sits there now, then the vial that belongs there, so the two can be compared.
    const targetIdx = this.tubes.findIndex((t, i) => t.id !== i);
    if (targetIdx === -1) {
      sound.playClick(600);
      this.render();
      return;
    }

    const rightPos = this.tubes.findIndex((t) => t.id === targetIdx);
    const rightTube = this.tubes[rightPos];
    const sittingTube = this.tubes[targetIdx];
    this.selectedTubeIdx = null;
    this.hintHighlights = [targetIdx, rightPos];
    this.hintMessage = `Slot 0${targetIdx + 1} is waiting for the ${rightTube.short} vial.`;

    sound.playSpectrumTone(sittingTube.audioFreq, 0.3);
    if (this.pairTimer) clearTimeout(this.pairTimer);
    this.pairTimer = setTimeout(
      () => sound.playSpectrumTone(rightTube.audioFreq, 0.3),
      420,
    );
    this.render();
  }

  // Mastermind-style reading: how many vials sit in their final slot, without saying which.
  checkOrder() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.checksUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    const inPlace = this.tubes.filter((t, i) => t.id === i).length;
    this.hintHighlights = [];
    this.hintMessage =
      inPlace === 0
        ? "None of the seven vials are in their place yet."
        : `${inPlace} of ${this.tubes.length} vials are in their place.`;
    sound.playClick(inPlace > 0 ? 640 : 300);
    this.render();
  }

  resetPuzzle() {
    if (this.solved) return;
    sound.playClick(320);
    this.history = [];
    this.tubes = this.initialTubes.map((t) => ({ ...t }));
    this.selectedTubeIdx = null;
    this.lastSwappedPair = null;
    this.hintMessage = null;
    this.hintHighlights = [];
    this.render();
  }

  destroy() {
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (this.sequenceTimer) clearTimeout(this.sequenceTimer);
    if (this.pairTimer) clearTimeout(this.pairTimer);
    this.hintCooldownTimer = null;
    this.sequenceTimer = null;
    this.pairTimer = null;
    this.isPlayingSequence = false;
  }

  getShareSummary() {
    const elapsedSec = Math.max(
      1,
      Math.round((Date.now() - this.startTime) / 1000),
    );
    const rainbow = ["purple", "blue", "cyan", "emerald", "active", "orange", "coral"];
    const visualCells = this.tubes.map((_, i) => rainbow[i % rainbow.length]);

    return {
      gameName: "SPECTRUM",
      subtitle: "seven hidden voices ordered by ear",
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: "time",
      stat1Value: `${elapsedSec}s`,
      stat2Label: "moves",
      stat2Value: `${this.moves}`,
      stat3Label: "harmony",
      stat3Value: "100%",
      gridCols: 7,
      visualCells,
      metricText: `${this.moves} swaps • ${elapsedSec}s`,
      shareText: `focal • spectrum (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} swaps\n🌈 seven voices tuned by ear`,
    };
  }

  // Top Starlight Spectroscope: a live ribbon of the rack's colors. Colors are decoys, so it carries
  // no pitch information; the string nodes only light up for the vial you just heard.
  renderSpectroscopeChamber() {
    const W = 420;
    const H = 68;
    const n = this.tubes.length;
    const xs = this.tubes.map((_, i) =>
      Math.round(34 + (i * (W - 68)) / (n - 1)),
    );

    const gradStops = this.tubes
      .map(
        (t, i) =>
          `<stop offset="${Math.round((i / (n - 1)) * 100)}%" stop-color="${t.color}" />`,
      )
      .join("");

    let nodesHtml = "";
    for (let i = 0; i < n; i++) {
      const t = this.tubes[i];
      const x = xs[i];
      const isActive =
        this.activePlayingIdx === i || this.selectedTubeIdx === i;
      nodesHtml += `
        <line x1="${x}" y1="10" x2="${x}" y2="58" class="sp-string-line ${this.solved ? "is-aligned" : ""}" />
        ${isActive ? `<circle cx="${x}" cy="33" r="9.5" fill="none" stroke="${t.color}" class="sp-node-ripple" />` : ""}
        <circle cx="${x}" cy="33" r="4.2" fill="${t.color}" stroke="#ffffff" stroke-width="1" class="sp-pitch-node" />
        <text x="${x}" y="65" text-anchor="middle" class="sp-node-label">${this.solved ? t.note : "?"}</text>
      `;
    }

    const caption = this.solved
      ? "All seven vials chime from lowest to highest: the starlight is in tune"
      : this.selectedTubeIdx !== null
        ? `The <strong>${this.tubes[this.selectedTubeIdx].short}</strong> vial is chosen: tap another to trade places`
        : "Colors are decoys. Order the vials by ear, lowest voice first";

    return `
      <div class="sp-chamber ${this.solved ? "is-still" : ""}">
        <div class="sp-chamber-top">
          <span class="sp-chamber-title">The seven vials</span>
          <span class="sp-chamber-count">${this.moves} swaps</span>
        </div>

        <svg viewBox="0 0 ${W} ${H}" class="sp-chamber-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sp-live-spectrum" x1="0" y1="0" x2="1" y2="0">
              ${gradStops}
            </linearGradient>
          </defs>
          <rect x="20" y="10" width="${W - 40}" height="46" rx="10" fill="url(#sp-live-spectrum)" class="sp-spectrum-band" />
          ${nodesHtml}
        </svg>

        <div class="sp-chamber-caption ${this.solved ? "done" : ""}">
          ${caption}
        </div>
      </div>
    `;
  }

  // Handcrafted SVG Alchemical Glass Vial of Starlight
  renderVialSvg(tube, idx, isSelected, isPlaying, isCorrect) {
    // Every vial is filled to the same level so liquid height gives nothing away
    const fillTopY = 38;
    const fillHeight = 132 - fillTopY;
    const gradId = `sp-vial-grad-${idx}`;

    // Standing acoustic wave inside the liquid column
    const wavePts = [];
    for (let y = fillTopY + 6; y <= 126; y += 4) {
      const freq = 1.8;
      const amp = isPlaying ? 5.2 : 2.8;
      const x = 34 + amp * Math.sin(((y - fillTopY) / 40) * Math.PI * freq);
      wavePts.push(`${x.toFixed(1)},${y}`);
    }

    // Top stopper: turned brass cork
    const capSvg = `
        <rect x="24" y="14" width="20" height="8" rx="3" class="sp-cork-top" />
        <path d="M 20 22 L 48 22 L 45 30 L 23 30 Z" class="sp-brass-cap" />
        <line x1="21" y1="25" x2="47" y2="25" class="sp-cap-seam" />
      `;

    return `
      <svg viewBox="0 0 68 160" class="sp-vial-svg" aria-hidden="true">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${tube.core}" stop-opacity="0.95" />
            <stop offset="35%" stop-color="${tube.color}" stop-opacity="0.88" />
            <stop offset="100%" stop-color="${tube.color}" stop-opacity="0.55" />
          </linearGradient>
        </defs>

        <!-- Ambient Vial Aura -->
        <ellipse cx="34" cy="86" rx="24" ry="52" fill="${tube.color}" class="sp-vial-aura ${isPlaying || isSelected ? "is-bright" : ""}" />

        <!-- Top Brass Stopper / Crown Seal -->
        ${capSvg}

        <!-- Blown-Glass Ampoule Body -->
        <rect x="18" y="30" width="32" height="104" rx="15" class="sp-glass-outer" />

        <!-- Starlight Liquid Column -->
        <clipPath id="sp-clip-${idx}">
          <rect x="19.5" y="31.5" width="29" height="101" rx="14" />
        </clipPath>
        <g clip-path="url(#sp-clip-${idx})">
          <rect x="19" y="${fillTopY}" width="30" height="${fillHeight}" fill="url(#${gradId})" class="sp-liquid-fill" />
          <!-- Meniscus glow -->
          <ellipse cx="34" cy="${fillTopY}" rx="14.5" ry="3.2" fill="${tube.core}" opacity="0.9" />
          <!-- Internal standing acoustic wave filament -->
          ${wavePts.length > 1 ? `<polyline points="${wavePts.join(" ")}" stroke="${tube.core}" class="sp-internal-wave" />` : ""}
          <!-- Floating starlight spark inside the vial -->
          <path d="M 34 ${fillTopY + 10} L 35.4 ${fillTopY + 14.6} L 40 ${fillTopY + 16} L 35.4 ${fillTopY + 17.4} L 34 ${fillTopY + 22} L 32.6 ${fillTopY + 17.4} L 28 ${fillTopY + 16} L 32.6 ${fillTopY + 14.6} Z"
                fill="#ffffff" opacity="0.9" class="sp-vial-spark" />
          <circle cx="27" cy="${Math.min(122, fillTopY + 28)}" r="1.3" fill="#ffffff" opacity="0.7" />
          <circle cx="40" cy="${Math.min(125, fillTopY + 38)}" r="1.0" fill="#ffffff" opacity="0.6" />
        </g>

        <!-- Etched Glass Graduation Ticks & Specular Highlight -->
        <line x1="21" y1="48" x2="25" y2="48" class="sp-glass-tick" />
        <line x1="21" y1="64" x2="27" y2="64" class="sp-glass-tick major" />
        <line x1="21" y1="80" x2="25" y2="80" class="sp-glass-tick" />
        <line x1="21" y1="96" x2="27" y2="96" class="sp-glass-tick major" />
        <line x1="21" y1="112" x2="25" y2="112" class="sp-glass-tick" />
        <path d="M 23.5 40 L 23.5 120" class="sp-glass-shine" />

        <!-- Bottom Brass Pedestal Base & Alignment Jewel -->
        <path d="M 19 130 L 49 130 L 52 142 L 16 142 Z" class="sp-brass-base" />
        <rect x="14" y="141" width="40" height="5" rx="2.5" class="sp-brass-rim" />
        <circle cx="34" cy="136" r="2.8" class="sp-base-jewel ${isCorrect ? "is-aligned" : ""}" />
      </svg>
    `;
  }

  render() {
    const isCooldown =
      this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown
      ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000)
      : 0;

    const tubesHtml = this.tubes
      .map((tube, idx) => {
        const isSelected = this.selectedTubeIdx === idx;
        const isPlaying = this.activePlayingIdx === idx;
        const isCorrect = this.solved;
        const isSwapped =
          this.lastSwappedPair && this.lastSwappedPair.includes(idx);
        const isHinted =
          this.hintHighlights && this.hintHighlights.includes(idx);

        return `
        <div class="spectrum-tube ${isSelected ? "is-selected" : ""} ${isPlaying ? "is-playing" : ""} ${isCorrect ? "is-aligned" : ""} ${isSwapped ? "just-swapped" : ""} ${isHinted ? "cell-hint-glow" : ""} ${this.solved ? "is-solved-tube" : ""}"
             data-index="${idx}"
             style="--tube-color: ${tube.color};"
             title="Tap to hear · tap another vial to swap">
          <div class="tube-top-cap">
            <span class="tube-slot-num">0${idx + 1}</span>
          </div>

          ${this.renderVialSvg(tube, idx, isSelected, isPlaying, isCorrect)}

          <div class="tube-bottom-info">
            <strong class="tube-note">${this.solved ? tube.note : "?"}</strong>
            <span class="tube-name">${tube.short}</span>
          </div>
        </div>
      `;
      })
      .join("");

    this.lastSwappedPair = null;

    this.container.innerHTML = `
      <div class="game-panel spectrum-panel ${this.solved ? "is-solved" : ""}">
        <!-- Top Starlight Spectroscope & Melody Wave Chamber -->
        ${this.renderSpectroscopeChamber()}

        <!-- Horizontal Starlight Vials Rack -->
        <div class="spectrum-rack-wrapper">
          <div class="spectrum-tubes-rack" id="spectrum-rack">
            ${tubesHtml}
          </div>
        </div>

        <!-- Sequence Chime Audition Button -->
        <div style="display: flex; justify-content: center; gap: 12px; margin: 2px 0 4px;">
          <button id="spectrum-play-seq-btn" class="subtle-pill-btn sp-audition-btn" ${this.isPlayingSequence ? "disabled" : ""}>
            ${ico("note")}<span>${this.isPlayingSequence ? "listening…" : "hear the melody"}</span>
          </button>
        </div>

        ${
          this.hintMessage
            ? `
          <div class="res-hint-banner active" id="sp-hint-banner" title="Click to dismiss">
            <span class="res-hint-badge">${ico("lantern")}</span>
            <span class="res-hint-text">${this.hintMessage}</span>
          </div>
        `
            : ""
        }

        <!-- Bottom Controls -->
        <div class="game-footer-bar">
          <div class="quick-tip">
            tap a vial to hear it, tap two to trade places. Lowest voice on the left, highest on the right.
          </div>
          <div class="action-btns action-btns-split action-btns-2x2">
            <button id="spectrum-undo-btn" class="btn-secondary" ${this.history.length === 0 || this.solved ? "disabled" : ""}>${ico("undo")}<span>undo</span></button>
            <button id="spectrum-reset-btn" class="btn-secondary" title="Return the vials to where you found them">
              ${ico("reset")}<span>start fresh</span>
            </button>
            <button id="spectrum-check-btn" class="btn-secondary btn-push-right ${isCooldown ? "cooldown-active" : ""}"
                    title="Hear how many vials are in their place" ${isCooldown || this.solved ? "disabled" : ""}>
              check order (${this.checksUsed})
            </button>
            <button id="spectrum-hint-btn" class="btn-secondary btn-hint ${isCooldown ? "cooldown-active" : ""}"
                    style="--cooldown-dur: ${remSec}s" ${isCooldown ? "disabled" : ""}>
              <span class="btn-text">hint (${this.hintsUsed})</span>
              <span class="btn-cooldown-wipe"></span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Attach click listeners to vials
    this.container.querySelectorAll(".spectrum-tube").forEach((el) => {
      const idx = parseInt(el.dataset.index, 10);
      el.addEventListener("click", () => this.handleTubeClick(idx));
    });

    this.container
      .querySelector("#spectrum-play-seq-btn")
      ?.addEventListener("click", () => this.playFullSequence());
    this.container
      .querySelector("#spectrum-undo-btn")
      ?.addEventListener("click", () => this.undo());
    this.container
      .querySelector("#spectrum-hint-btn")
      ?.addEventListener("click", () => this.giveHint());
    this.container
      .querySelector("#spectrum-check-btn")
      ?.addEventListener("click", () => this.checkOrder());
    this.container
      .querySelector("#spectrum-reset-btn")
      ?.addEventListener("click", () => this.resetPuzzle());
    this.container
      .querySelector("#sp-hint-banner")
      ?.addEventListener("click", () => {
        this.hintMessage = null;
        this.hintHighlights = [];
        this.render();
      });

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        for (const id of ["#spectrum-hint-btn", "#spectrum-check-btn"]) {
          const btn = this.container.querySelector(id);
          if (btn) {
            btn.classList.remove("cooldown-active");
            btn.removeAttribute("disabled");
          }
        }
      }, remSec * 1000);
    }
  }
}
