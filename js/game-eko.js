// INSTRUMENT 04: ECHO (The Valley's Memory)
// Call into the canyon and measure the returning echo, bridging the distance between mountain and sea.
// 1. Listen to the Target Echo (Call ... [secret Δt] ... Returning Echo) and hold the silence in memory.
// 2. Press & Hold the brass sounding pad (or Spacebar) for that exact interval. When you release,
//    your measured echo plays back immediately.
// 3. Compare by ear and seal the reading across 5 canyon landmarks.

import { createRNG } from "./rng.js";
import { sound } from "./audio.js";
import { ico } from "./icons.js";

const TOTAL_ROUNDS = 5;
const MIN_MS = 180;
const MAX_MS = 1250;
const SOUND_SPEED = 0.34; // 340 m/s -> 0.34 m/ms round-trip

const CANYON_LANDMARKS = [
  { numeral: "I", short: "Arch", name: "Whispering Arch" },
  { numeral: "II", short: "Gorge", name: "Cedar Gorge" },
  { numeral: "III", short: "Spire", name: "Gull’s Basalt Spire" },
  { numeral: "IV", short: "Hollow", name: "Mist Hollow" },
  { numeral: "V", short: "Cliff", name: "Far Horizon Cliff" },
];

// Soft grades instead of points: how close the echo came back to the canyon's.
const ECHO_GRADES = [
  {
    key: "clear",
    short: "clear",
    label: "Clear echo",
    maxMs: 60,
    block: "🟩",
    cell: "emerald",
  },
  {
    key: "faint",
    short: "faint",
    label: "Faint echo",
    maxMs: 160,
    block: "🟨",
    cell: "yellow",
  },
  {
    key: "lost",
    short: "lost",
    label: "Lost echo",
    maxMs: Infinity,
    block: "🟧",
    cell: "empty",
  },
];

const gradeFor = (diffMs) => ECHO_GRADES.find((g) => diffMs <= g.maxMs);

export class EkoGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;
    this.seed = "";
    this.rounds = []; // 5 target echo delays (ms)
    this.currentRound = 0;
    this.recordedMs = null; // Player's held duration (ms), null until they hold & release
    this.roundResults = [];
    this.phase = "listen"; // 'listen' | 'revealed' | 'finished'
    this.isHolding = false;
    this.holdStartTime = 0;
    this.playbackTimer = null;
    this.keyDownHandler = null;
    this.keyUpHandler = null;
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    const rng = createRNG(`EKO_V3_${seedStr}`);

    this.rounds = [];
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      const bandMin = MIN_MS + i * 190;
      const bandMax = Math.min(MAX_MS, bandMin + 240);
      this.rounds.push(rng.int(bandMin, bandMax));
    }
    this.rounds = rng.shuffle(this.rounds);

    this.currentRound = 0;
    this.recordedMs = null;
    this.roundResults = [];
    this.phase = "listen";
    this.isHolding = false;

    this.bindKeyboard();
    this.render();
  }

  destroy() {
    this.unbindKeyboard();
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  bindKeyboard() {
    this.unbindKeyboard();
    this.keyDownHandler = (e) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        this.phase === "listen" &&
        !this.isHolding
      ) {
        if (document.getElementById("eko-pad-btn")) {
          e.preventDefault();
          this.startHold();
        }
      }
    };
    this.keyUpHandler = (e) => {
      if (e.code === "Space" && this.phase === "listen" && this.isHolding) {
        if (document.getElementById("eko-pad-btn")) {
          e.preventDefault();
          this.endHold();
        }
      }
    };
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }

  unbindKeyboard() {
    if (this.keyDownHandler)
      window.removeEventListener("keydown", this.keyDownHandler);
    if (this.keyUpHandler)
      window.removeEventListener("keyup", this.keyUpHandler);
  }

  resetBoard() {
    sound.playClick(340);
    this.loadSeed(this.seed);
  }

  msToMeters(ms) {
    return ((ms * SOUND_SPEED) / 2).toFixed(1);
  }

  // Play the secret Target Echo & animate the outer target ring + canyon panorama beacon
  playCurrentTargetEcho() {
    const targetMs = this.rounds[this.currentRound];
    if (!targetMs) return;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);

    sound.playEchoPulse(targetMs);
    this.triggerRingPulse("target-ring", 0);
    this.playbackTimer = setTimeout(() => {
      this.triggerRingPulse("target-ring", 1);
    }, targetMs);
  }

  // Play the player's own recorded echo & animate the inner user ring + canyon panorama beacon
  playRecordedEcho() {
    const ms =
      this.phase === "revealed"
        ? this.roundResults[this.roundResults.length - 1]?.guessMs
        : this.recordedMs;
    if (!ms) return;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);

    sound.playEchoPulse(ms);
    this.triggerRingPulse("user-ring", 0);
    this.playbackTimer = setTimeout(() => {
      this.triggerRingPulse("user-ring", 1);
    }, ms);
  }

  triggerRingPulse(ringClass, step) {
    const pad = this.container.querySelector("#eko-orb-stage");
    const chamber = this.container.querySelector("#eko-canyon-chamber");
    const cls = step === 0 ? `${ringClass}-ping` : `${ringClass}-echo`;

    if (pad) {
      pad.classList.remove(cls);
      void pad.offsetWidth;
      pad.classList.add(cls);
      setTimeout(() => pad.classList.remove(cls), 420);
    }
    if (chamber) {
      chamber.classList.remove(cls);
      void chamber.offsetWidth;
      chamber.classList.add(cls);
      setTimeout(() => chamber.classList.remove(cls), 420);
    }
  }

  startHold() {
    if (this.phase !== "listen" || this.isHolding) return;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);

    this.isHolding = true;
    this.holdStartTime = performance.now();

    sound.playClick(640, 0.035, "sine", 0.14);

    const padBtn = this.container.querySelector("#eko-pad-btn");
    const padTitle = this.container.querySelector("#eko-pad-title");
    const padHint = this.container.querySelector("#eko-pad-sub");
    const orbStage = this.container.querySelector("#eko-orb-stage");
    if (padBtn) padBtn.classList.add("holding");
    if (orbStage) orbStage.classList.add("is-holding");
    if (padTitle) padTitle.textContent = "listening…";
    if (padHint) padHint.textContent = "let go to hear your echo";
  }

  endHold() {
    if (!this.isHolding || this.phase !== "listen") return;
    this.isHolding = false;

    const elapsed = Math.round(performance.now() - this.holdStartTime);
    this.recordedMs = Math.max(70, Math.min(2200, elapsed));

    const padBtn = this.container.querySelector("#eko-pad-btn");
    const orbStage = this.container.querySelector("#eko-orb-stage");
    if (padBtn) padBtn.classList.remove("holding");
    if (orbStage) orbStage.classList.remove("is-holding");

    this.render();

    setTimeout(() => {
      this.playRecordedEcho();
    }, 140);
  }

  submitGuess() {
    if (this.phase !== "listen" || this.recordedMs === null) return;

    const targetMs = this.rounds[this.currentRound];
    const diffMs = Math.abs(this.recordedMs - targetMs);

    const grade = gradeFor(diffMs);

    this.roundResults.push({
      round: this.currentRound + 1,
      landmark: CANYON_LANDMARKS[this.currentRound].name,
      targetMs,
      guessMs: this.recordedMs,
      diffMs,
      grade: grade.key,
    });

    if (grade.key === "clear") {
      sound.playHarmonicLock(this.currentRound);
    } else {
      sound.playClick(420, 0.06);
    }

    this.phase = "revealed";
    this.render();
  }

  nextRound() {
    if (this.currentRound + 1 < TOTAL_ROUNDS) {
      this.currentRound++;
      this.phase = "listen";
      this.recordedMs = null;
      sound.playClick(520);
      this.render();
      setTimeout(() => this.playCurrentTargetEcho(), 240);
    } else {
      this.phase = "finished";
      sound.playVictory();
      this.render();
      if (this.onWin) {
        setTimeout(() => this.onWin(this.getShareSummary()), 350);
      }
    }
  }

  gradeOf(res) {
    return ECHO_GRADES.find((g) => g.key === res.grade);
  }

  clearCount() {
    return this.roundResults.filter((r) => r.grade === "clear").length;
  }

  getShareSummary() {
    const clear = this.clearCount();
    const avgError = Math.round(
      this.roundResults.reduce((acc, r) => acc + r.diffMs, 0) / TOTAL_ROUNDS,
    );

    const bars = this.roundResults.map((r) => this.gradeOf(r).block).join("");
    const visualCells = this.roundResults.map((r) => this.gradeOf(r).cell);

    return {
      gameName: "ECHO",
      subtitle: "5-round canyon echo charted",
      seed: this.seed,
      moves: TOTAL_ROUNDS,
      hints: 0,
      timeSec: avgError,
      stat1Label: "clear echoes",
      stat1Value: `${clear}/${TOTAL_ROUNDS}`,
      stat2Label: "avg drift",
      stat2Value: `±${avgError} ms`,
      stat3Label: "ridges",
      stat3Value: `5/5`,
      gridCols: 5,
      visualCells,
      metricText: `${clear}/${TOTAL_ROUNDS} clear echoes • avg ±${avgError} ms`,
      shareText: `focal • echo (${this.seed})
${clear}/${TOTAL_ROUNDS} clear echoes (avg drift: ±${avgError} ms)
${bars}`,
    };
  }

  // Top Canyon & Sea Acoustic Panorama
  renderCanyonPanorama(lastRes) {
    const landmark =
      CANYON_LANDMARKS[Math.min(this.currentRound, TOTAL_ROUNDS - 1)];
    const isRevealed = this.phase === "revealed" && lastRes;
    const isFinished = this.phase === "finished";

    // Map ms (150..1350) to x coordinate in canyon (130..366)
    const msToX = (ms) => {
      const clamped = Math.max(120, Math.min(1400, ms));
      return Math.round(122 + ((clamped - 120) / 1280) * 246);
    };

    const targetX = isRevealed ? msToX(lastRes.targetMs) : 332;
    const guessX = isRevealed ? msToX(lastRes.guessMs) : null;

    let caption = `listen to the call and measure the returning echo`;
    if (isRevealed) {
      caption = `<strong>${landmark.name}</strong> stands at <strong>${this.msToMeters(lastRes.targetMs)} m</strong>; your echo reached <strong>${this.msToMeters(lastRes.guessMs)} m</strong>`;
    } else if (isFinished) {
      caption = "All five ridges charted. Mountain and sea rest in stillness.";
    }

    return `
      <div class="ek-chamber ${isFinished ? "is-still" : ""}" id="eko-canyon-chamber">
        <div class="ek-chamber-top">
          <span class="ek-chamber-title">The canyon above Quiet Harbor</span>
          <span class="ek-chamber-meta">${isFinished ? "5/5 ridges sealed" : `Ridge ${landmark.numeral} of V`}</span>
        </div>

        <svg viewBox="0 0 400 84" class="ek-canyon-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="ek-sky-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(22, 18, 42, 0.85)" />
              <stop offset="65%" stop-color="rgba(52, 38, 78, 0.55)" />
              <stop offset="100%" stop-color="rgba(26, 38, 58, 0.75)" />
            </linearGradient>

          </defs>

          <!-- Background twilight sky & stars -->
          <rect x="2" y="2" width="396" height="80" rx="10" fill="url(#ek-sky-grad)" />
          <circle cx="96" cy="16" r="0.9" fill="#fff4d4" opacity="0.7" />
          <circle cx="158" cy="12" r="1.1" fill="#9bd1e5" opacity="0.8" />
          <circle cx="224" cy="19" r="0.8" fill="#fff4d4" opacity="0.6" />
          <circle cx="288" cy="14" r="1.1" fill="#f3c4dc" opacity="0.75" />
          <!-- Crescent moon -->
          <path d="M 346 13 A 6.5 6.5 0 1 0 352 23 A 5.2 5.2 0 1 1 346 13 Z" fill="#ffe1a6" opacity="0.85" />

          <!-- Distant layered canyon ridges -->
          <path d="M 76 68 L 118 38 L 154 56 L 204 28 L 252 54 L 308 24 L 358 46 L 398 30 L 398 68 Z"
                fill="rgba(34, 24, 52, 0.65)" stroke="rgba(243, 196, 220, 0.16)" stroke-width="1" />

          <!-- Calm harbor water at bottom of gorge -->
          <line x1="6" y1="68" x2="394" y2="68" stroke="rgba(155, 209, 229, 0.25)" stroke-width="1" />
          <line x1="88" y1="73" x2="180" y2="73" stroke="rgba(155, 209, 229, 0.14)" stroke-width="1" stroke-linecap="round" />
          <line x1="220" y1="76" x2="330" y2="76" stroke="rgba(255, 217, 120, 0.14)" stroke-width="1" stroke-linecap="round" />

          <!-- Left Granite Cliff & Lighthouse Tower -->
          <path d="M 2 82 L 2 44 L 34 42 L 56 54 L 68 68 L 68 82 Z" fill="#231934" stroke="rgba(255, 236, 214, 0.22)" stroke-width="1.2" />
          <!-- Lighthouse tower body -->
          <polygon points="27,43 39,43 36.5,20 29.5,20" fill="#d8c3a5" stroke="#fff4d4" stroke-width="0.9" />
          <rect x="28.5" y="15.5" width="9" height="4.5" rx="1" fill="#3a2846" stroke="#ffd978" stroke-width="0.9" />
          <polygon points="27,15.5 39,15.5 33,11" fill="#e07a5f" />
          <!-- Lighthouse lantern & acoustic horn -->
          <circle cx="33" cy="17.8" r="2.2" fill="#ffd978" class="ek-lh-lantern" />
          <g class="ek-caller-node" transform="translate(46, 36)">
            <circle cx="0" cy="0" r="10" class="ek-horn-ripple" />
            <circle cx="0" cy="0" r="3.4" class="ek-horn-dot" />
          </g>

          <!-- Acoustic Flight Arcs -->
          ${
            isRevealed
              ? `
            <!-- Target Canyon Echo Arc (Cyan) -->
            <path d="M 46 36 Q ${Math.round((46 + targetX) / 2)} 10 ${targetX} 36" class="ek-arc-target" />
            <path d="M ${targetX} 36 Q ${Math.round((46 + targetX) / 2)} 60 46 36" class="ek-arc-target-return" />
            <line x1="${targetX}" y1="20" x2="${targetX}" y2="68" class="ek-cliff-marker-line target" />
            <circle cx="${targetX}" cy="36" r="4.5" class="ek-cliff-node target" />

            <!-- Player Measured Echo Arc (Amber) -->
            <path d="M 46 36 Q ${Math.round((46 + guessX) / 2)} 16 ${guessX} 36" class="ek-arc-user" />
            <line x1="${guessX}" y1="24" x2="${guessX}" y2="68" class="ek-cliff-marker-line user" />
            <circle cx="${guessX}" cy="36" r="4" class="ek-cliff-node user" />
          `
              : `
            <!-- Listening Phase: Uncharted Mist Arc -->
            <path d="M 46 36 Q 190 12 332 36" class="ek-arc-listening" />
            <path d="M 332 36 Q 190 60 46 36" class="ek-arc-listening-return" />
            <g class="ek-echo-node" transform="translate(332, 36)">
              <circle cx="0" cy="0" r="12" class="ek-cliff-ripple" />
              <circle cx="0" cy="0" r="4" class="ek-cliff-dot" />
            </g>
          `
          }
        </svg>

        <div class="ek-chamber-caption ${isFinished ? "done" : ""}">
          ${caption}
        </div>
      </div>
    `;
  }

  // Central Concentric Acoustic Sounding Pad SVG + Button
  renderListeningOrb(hasRec) {
    let ticks = "";
    for (let i = 0; i < 36; i++) {
      const angle = (i * 10 * Math.PI) / 180;
      const major = i % 3 === 0;
      const r1 = major ? 109 : 111;
      const r2 = 115;
      const x1 = (120 + r1 * Math.cos(angle)).toFixed(1);
      const y1 = (120 + r1 * Math.sin(angle)).toFixed(1);
      const x2 = (120 + r2 * Math.cos(angle)).toFixed(1);
      const y2 = (120 + r2 * Math.sin(angle)).toFixed(1);
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ek-dial-tick ${major ? "major" : ""}" />`;
    }

    return `
      <div id="eko-orb-stage" class="eko-orb-stage">
        <svg viewBox="0 0 240 240" class="ek-orb-svg" aria-hidden="true">
          ${ticks}
          <!-- Outer Target Echo Ring (Cyan) -->
          <circle cx="120" cy="120" r="104" class="ek-svg-ring outer-target-ring" />
          <circle cx="120" cy="16" r="3" class="ek-ring-node cyan" />
          <circle cx="120" cy="224" r="3" class="ek-ring-node cyan" />
          <circle cx="16" cy="120" r="3" class="ek-ring-node cyan" />
          <circle cx="224" cy="120" r="3" class="ek-ring-node cyan" />

          <!-- Inner User Echo Ring (Amber) -->
          <circle cx="120" cy="120" r="88" class="ek-svg-ring inner-user-ring ${hasRec ? "recorded" : ""}" />
          <circle cx="120" cy="32" r="2.6" class="ek-ring-node amber ${hasRec ? "recorded" : ""}" />
          <circle cx="120" cy="208" r="2.6" class="ek-ring-node amber ${hasRec ? "recorded" : ""}" />
        </svg>

        <button id="eko-pad-btn" class="eko-tactile-pad" type="button">
          <svg viewBox="0 0 40 40" class="ek-pad-horn-svg" aria-hidden="true">
            <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2" opacity="0.45" />
            <path d="M 12 20 C 12 15.5, 15.5 12, 20 12 C 24.5 12, 28 15.5, 28 20 C 28 24.5, 24.5 28, 20 28 C 15.5 28, 12 24.5, 12 20 Z" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75" />
            <circle cx="20" cy="20" r="3.6" fill="currentColor" />
          </svg>
          <strong id="eko-pad-title" class="pad-title">${hasRec ? "hold to sound it again" : "hold"}</strong>
          <span id="eko-pad-sub" class="pad-sub">
            ${hasRec ? "or compare by ear, then seal" : "as long as the silence lasted"}
          </span>
          <span class="ek-space-tag">spacebar</span>
        </button>
      </div>
    `;
  }

  // Reveal Comparison Box with Distance Scale
  renderRevealBox(lastRes) {
    const maxScaleMs = 1350;
    const targetPct = Math.max(
      6,
      Math.min(94, (lastRes.targetMs / maxScaleMs) * 100),
    );
    const guessPct = Math.max(
      6,
      Math.min(94, (lastRes.guessMs / maxScaleMs) * 100),
    );
    const leftPct = Math.min(targetPct, guessPct);
    const widthPct = Math.max(1, Math.abs(targetPct - guessPct));

    const harmonyBadge = this.gradeOf(lastRes).label;

    return `
      <div class="eko-reveal-box">
        <div class="ek-bridge-gauge">
          <div class="ek-bridge-labels">
            <span>Lighthouse (0 m)</span>
            <span class="ek-harmony-grade">${harmonyBadge}</span>
            <span>Far Cliff (230 m)</span>
          </div>
          <div class="ek-bridge-track">
            <div class="ek-bridge-diff" style="left:${leftPct}%; width:${widthPct}%;"></div>
            <div class="ek-bridge-pin target" style="left:${targetPct}%;" title="Target: ${lastRes.targetMs} ms (${this.msToMeters(lastRes.targetMs)} m)">
              <span class="ek-pin-tag">target</span>
            </div>
            <div class="ek-bridge-pin user" style="left:${guessPct}%;" title="Your Echo: ${lastRes.guessMs} ms (${this.msToMeters(lastRes.guessMs)} m)">
              <span class="ek-pin-tag">you</span>
            </div>
          </div>
        </div>

        <div class="reveal-cols">
          <div class="rev-col">
            <span class="rev-lbl">target canyon echo</span>
            <strong class="rev-val cyan">${lastRes.targetMs}<small>ms</small></strong>
            <span class="rev-meter">${this.msToMeters(lastRes.targetMs)} meters</span>
          </div>
          <div class="rev-divider"></div>
          <div class="rev-col">
            <span class="rev-lbl">your measured echo</span>
            <strong class="rev-val amber">${lastRes.guessMs}<small>ms</small></strong>
            <span class="rev-meter">${this.msToMeters(lastRes.guessMs)} meters</span>
          </div>
        </div>

        <div class="reveal-score-banner">
          <span>drift: <strong>±${lastRes.diffMs} ms</strong></span>
        </div>
      </div>
    `;
  }

  // Final 5-Round Summary Table when finished
  renderFinishedLog() {
    const avgError = Math.round(
      this.roundResults.reduce((acc, r) => acc + r.diffMs, 0) / TOTAL_ROUNDS,
    );
    return `
      <div class="eko-reveal-box ek-finished-log">
        <div class="ek-log-header">
          <span>Valley Observation Log</span>
          <strong>${this.clearCount()} / ${TOTAL_ROUNDS} clear · avg ±${avgError} ms</strong>
        </div>
        <div class="ek-log-rows">
          ${this.roundResults
            .map(
              (r, i) => `
            <div class="ek-log-row">
              <span class="ek-log-ridge"><strong>${CANYON_LANDMARKS[i].numeral}.</strong> ${CANYON_LANDMARKS[i].name}</span>
              <span class="ek-log-dist">${r.targetMs} ms</span>
              <span class="ek-log-diff">±${r.diffMs} ms</span>
              <strong class="ek-log-score">${this.gradeOf(r).short}</strong>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  render() {
    const lastRes = this.roundResults[this.roundResults.length - 1];
    const hasRec = this.recordedMs !== null || this.phase === "revealed";

    this.container.innerHTML = `
      <div class="game-panel eko-panel ${this.phase === "finished" ? "is-solved" : ""}">
        <!-- Top Canyon & Sea Acoustic Panorama -->
        ${this.renderCanyonPanorama(lastRes)}

        <!-- 5-Ridge Canyon Log Strip -->
        <div class="denge-regions-bar ek-rounds-bar">
          ${Array.from({ length: TOTAL_ROUNDS }, (_, idx) => {
            const res = this.roundResults[idx];
            const lm = CANYON_LANDMARKS[idx];
            const isCurrent =
              idx === this.currentRound && this.phase !== "finished";
            return `
              <div class="region-chip ${res ? "done" : ""} ${isCurrent ? "is-current-round" : ""}">
                <span class="region-dot" style="background:${res ? "#9fe3c4" : isCurrent ? "#ffd978" : "rgba(255,255,255,0.2)"}"></span>
                <span>${lm.numeral} · ${lm.short}</span>
                <strong>${res ? this.gradeOf(res).short : "—"}</strong>
              </div>
            `;
          }).join("")}
        </div>

        <!-- Sculptural Acoustic Centerpiece Stage -->
        <div class="denge-stage">
          <div class="denge-board-3d eko-sculpt-card ${this.phase === "revealed" ? "board-locked" : ""}">
            ${
              this.phase !== "finished"
                ? `
              <!-- Top Listen Comparison Controls -->
              <div class="eko-compare-bar">
                <button id="btn-eko-target" class="eko-listen-pill target" type="button">
                  <span class="pill-dot cyan"></span>
                  <span>hear the canyon</span>
                </button>

                <button id="btn-eko-user" class="eko-listen-pill user ${hasRec ? "" : "disabled"}" type="button" ${hasRec ? "" : "disabled"}>
                  <span class="pill-dot amber"></span>
                  <span>${hasRec ? "hear your echo" : "no echo yet"}</span>
                </button>
              </div>
            `
                : ""
            }

            <!-- Central Tactile Acoustic Pad / Reveal Display / Final Log -->
            ${
              this.phase === "listen"
                ? this.renderListeningOrb(this.recordedMs !== null)
                : this.phase === "revealed"
                  ? this.renderRevealBox(lastRes)
                  : this.renderFinishedLog()
            }

            <!-- Bottom Action Button inside Sculptural Frame -->
            <div class="eko-card-actions">
              ${
                this.phase === "listen"
                  ? `
                <button id="btn-eko-lock" class="white-pill-btn ${this.recordedMs !== null ? "" : "btn-disabled"}" ${this.recordedMs !== null ? "" : "disabled"}>
                  ${this.recordedMs !== null ? `<span>seal your echo</span>${ico("beam")}` : "hold the pad first"}
                </button>
              `
                  : this.phase === "revealed"
                    ? `
                <button id="btn-eko-next" class="white-pill-btn">
                  ${this.currentRound + 1 < TOTAL_ROUNDS ? `<span>next ridge</span>${ico("beam")}` : `<span>close the valley log</span>`}
                </button>
              `
                    : `
                <button id="btn-eko-replay" class="subtle-pill-btn">
                  ${ico("reset")}<span>call into the canyon again</span>
                </button>
              `
              }
            </div>
          </div>
        </div>

        <div class="game-footer-bar">
          <div class="quick-tip">
            listen to the call ${ico("beam")} hold the pad (or <strong>spacebar</strong>) for the same silence ${ico("beam")} compare by ear, then seal
          </div>
        </div>
      </div>
    `;

    // Bind Target & User echo replay buttons
    this.container
      .querySelector("#btn-eko-target")
      ?.addEventListener("click", () => {
        this.playCurrentTargetEcho();
      });

    this.container
      .querySelector("#btn-eko-user")
      ?.addEventListener("click", () => {
        this.playRecordedEcho();
      });

    // Bind Tactile Hold Pad
    const padBtn = this.container.querySelector("#eko-pad-btn");
    if (padBtn) {
      padBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.startHold();
      });
      window.addEventListener(
        "mouseup",
        () => {
          if (this.isHolding) this.endHold();
        },
        { once: false },
      );

      padBtn.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          this.startHold();
        },
        { passive: false },
      );
      padBtn.addEventListener(
        "touchend",
        (e) => {
          e.preventDefault();
          if (this.isHolding) this.endHold();
        },
        { passive: false },
      );
    }

    this.container
      .querySelector("#btn-eko-lock")
      ?.addEventListener("click", () => this.submitGuess());
    this.container
      .querySelector("#btn-eko-next")
      ?.addEventListener("click", () => this.nextRound());
    this.container
      .querySelector("#btn-eko-replay")
      ?.addEventListener("click", () => this.resetBoard());
  }
}
