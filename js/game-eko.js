// GAME 4: EKO (Pure Auditory Memory & Hold-to-Reproduce Echo Game)
// Mechanic:
// 1. Listen to the Target Echo (Ping ... [secret Δt] ... Echo) and hold the interval in memory.
// 2. Press & Hold the tactile pad for that exact duration. When you release, your recorded echo
//    automatically plays back (Ping ... [your Δt] ... Echo)!
// 3. No numbers are shown until you lock in - you judge purely by ear whether your echo matches the target!

import { createRNG } from './rng.js';
import { sound } from './audio.js';

const TOTAL_ROUNDS = 5;
const MIN_MS = 180;
const MAX_MS = 1250;
const SOUND_SPEED = 0.34; // 340 m/s

export class EkoGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;
    this.seed = '';
    this.rounds = [];          // 5 target echo delays (ms)
    this.currentRound = 0;
    this.recordedMs = null;    // Player's held duration (ms), null until they hold & release
    this.roundResults = [];
    this.phase = 'listen';     // 'listen' | 'revealed' | 'finished'
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
    this.phase = 'listen';
    this.isHolding = false;

    this.bindKeyboard();
    this.render();
  }

  bindKeyboard() {
    this.unbindKeyboard();
    this.keyDownHandler = (e) => {
      if (e.code === 'Space' && !e.repeat && this.phase === 'listen' && !this.isHolding) {
        if (document.getElementById('eko-pad-btn')) {
          e.preventDefault();
          this.startHold();
        }
      }
    };
    this.keyUpHandler = (e) => {
      if (e.code === 'Space' && this.phase === 'listen' && this.isHolding) {
        if (document.getElementById('eko-pad-btn')) {
          e.preventDefault();
          this.endHold();
        }
      }
    };
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  unbindKeyboard() {
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
  }

  resetBoard() {
    sound.playClick(340);
    this.loadSeed(this.seed);
  }

  msToMeters(ms) {
    return ((ms * SOUND_SPEED) / 2).toFixed(1);
  }

  // Play the secret Target Echo & animate the outer target ring on bounce
  playCurrentTargetEcho() {
    const targetMs = this.rounds[this.currentRound];
    if (this.playbackTimer) clearTimeout(this.playbackTimer);

    sound.playEchoPulse(targetMs);
    this.triggerRingPulse('target-ring', 0);
    this.playbackTimer = setTimeout(() => {
      this.triggerRingPulse('target-ring', 1);
    }, targetMs);
  }

  // Play the player's own recorded echo & animate the inner user ring on bounce
  playRecordedEcho() {
    if (!this.recordedMs) return;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);

    sound.playEchoPulse(this.recordedMs);
    this.triggerRingPulse('user-ring', 0);
    this.playbackTimer = setTimeout(() => {
      this.triggerRingPulse('user-ring', 1);
    }, this.recordedMs);
  }

  triggerRingPulse(ringClass, step) {
    const pad = this.container.querySelector('#eko-orb-stage');
    if (!pad) return;
    const cls = step === 0 ? `${ringClass}-ping` : `${ringClass}-echo`;
    pad.classList.remove(cls);
    void pad.offsetWidth;
    pad.classList.add(cls);
    setTimeout(() => pad.classList.remove(cls), 360);
  }

  startHold() {
    if (this.phase !== 'listen' || this.isHolding) return;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);

    this.isHolding = true;
    this.holdStartTime = performance.now();

    // Subtle tactile click on press start
    sound.playClick(640, 0.035, 'sine', 0.14);

    const padBtn = this.container.querySelector('#eko-pad-btn');
    const padHint = this.container.querySelector('#eko-pad-sub');
    if (padBtn) padBtn.classList.add('holding');
    if (padHint) padHint.textContent = 'release to play echo...';
  }

  endHold() {
    if (!this.isHolding || this.phase !== 'listen') return;
    this.isHolding = false;

    const elapsed = Math.round(performance.now() - this.holdStartTime);
    this.recordedMs = Math.max(70, Math.min(2200, elapsed));

    const padBtn = this.container.querySelector('#eko-pad-btn');
    if (padBtn) padBtn.classList.remove('holding');

    this.render();

    // Immediately replay the recorded echo so the player hears what they just created!
    setTimeout(() => {
      this.playRecordedEcho();
    }, 140);
  }

  submitGuess() {
    if (this.phase !== 'listen' || this.recordedMs === null) return;

    const targetMs = this.rounds[this.currentRound];
    const diffMs = Math.abs(this.recordedMs - targetMs);

    let score = 0;
    if (diffMs <= 12) {
      score = 100;
    } else {
      score = Math.max(0, Math.round(100 * Math.exp(-Math.pow((diffMs - 12) / 195, 1.35))));
    }

    this.roundResults.push({
      round: this.currentRound + 1,
      targetMs,
      guessMs: this.recordedMs,
      diffMs,
      score
    });

    if (score >= 85) {
      sound.playHarmonicLock(this.currentRound);
    } else {
      sound.playClick(420, 0.06);
    }

    this.phase = 'revealed';
    this.render();
  }

  nextRound() {
    if (this.currentRound + 1 < TOTAL_ROUNDS) {
      this.currentRound++;
      this.phase = 'listen';
      this.recordedMs = null;
      sound.playClick(520);
      this.render();
      setTimeout(() => this.playCurrentTargetEcho(), 240);
    } else {
      this.phase = 'finished';
      sound.playVictory();
      this.render();
      if (this.onWin) {
        setTimeout(() => this.onWin(this.getShareSummary()), 350);
      }
    }
  }

  getShareSummary() {
    const totalScore = this.roundResults.reduce((acc, r) => acc + r.score, 0);
    const avgError = Math.round(
      this.roundResults.reduce((acc, r) => acc + r.diffMs, 0) / TOTAL_ROUNDS
    );

    const bars = this.roundResults
      .map(r => (r.score >= 90 ? '🟩' : r.score >= 70 ? '🟨' : r.score >= 40 ? '🟧' : '⬛'))
      .join('');

    const visualCells = this.roundResults.map(r =>
      r.score >= 85 ? 'active' : r.score >= 60 ? 'amber' : 'empty'
    );

    return {
      gameName: 'ECHO',
      subtitle: '5-round echo memory test',
      seed: this.seed,
      moves: TOTAL_ROUNDS,
      hints: 0,
      timeSec: avgError,
      stat1Label: 'score',
      stat1Value: `${totalScore}/500`,
      stat2Label: 'avg error',
      stat2Value: `±${avgError} ms`,
      stat3Label: 'rounds',
      stat3Value: `5/5`,
      gridCols: 5,
      visualCells,
      metricText: `${totalScore} / 500 pts • avg ±${avgError} ms`,
      shareText: `focal • echo (${this.seed})\nscore: ${totalScore}/500 (avg error: ±${avgError} ms)\n${bars}`
    };
  }

  render() {
    const totalScore = this.roundResults.reduce((acc, r) => acc + r.score, 0);
    const lastRes = this.roundResults[this.roundResults.length - 1];
    const hasRec = this.recordedMs !== null;

    this.container.innerHTML = `
      <div class="game-panel eko-panel ${this.phase === 'finished' ? 'is-solved' : ''}">
        <!-- Top Round & Score Chips -->
        <div class="denge-regions-bar">
          ${Array.from({ length: TOTAL_ROUNDS }, (_, idx) => {
            const res = this.roundResults[idx];
            const isCurrent = idx === this.currentRound && this.phase !== 'finished';
            return `
              <div class="region-chip ${res ? 'done' : ''}" style="${isCurrent ? 'border-color:rgba(255,207,122,0.45);color:#fff;' : ''}">
                <span class="region-dot" style="background:${res ? '#34d399' : isCurrent ? '#fbbf24' : 'rgba(255,255,255,0.2)'}"></span>
                <span>round 0${idx + 1}</span>
                <strong>${res ? `${res.score}p` : '-'}</strong>
              </div>
            `;
          }).join('')}

          <div class="region-chip done" style="border-color:rgba(255,207,122,0.45);">
            <span>total</span>
            <strong>${totalScore}/500</strong>
          </div>
        </div>

        <!-- Sculptural Centerpiece Stage -->
        <div class="denge-stage">
          <div class="denge-board-3d eko-sculpt-card ${this.phase === 'revealed' ? 'board-locked' : ''}">
            
            <!-- Top Listen Comparison Controls -->
            <div class="eko-compare-bar">
              <button id="btn-eko-target" class="eko-listen-pill target">
                <span class="pill-dot cyan"></span>
                <span>listen to target echo</span>
              </button>

              <button id="btn-eko-user" class="eko-listen-pill user ${hasRec ? '' : 'disabled'}" ${hasRec ? '' : 'disabled'}>
                <span class="pill-dot amber"></span>
                <span>${hasRec ? 'listen to your echo' : 'not recorded yet'}</span>
              </button>
            </div>

            <!-- Central Tactile Acoustic Pad / Reveal Display -->
            ${this.phase === 'listen' ? `
              <div id="eko-orb-stage" class="eko-orb-stage">
                <div class="orb-ring outer-target-ring"></div>
                <div class="orb-ring inner-user-ring ${hasRec ? 'recorded' : ''}"></div>

                <button id="eko-pad-btn" class="eko-tactile-pad" type="button">
                  <span class="pad-icon">◎</span>
                  <strong class="pad-title">hold down</strong>
                  <span id="eko-pad-sub" class="pad-sub">
                    ${hasRec ? 'hold to re-record' : 'hold for target duration and release'}
                  </span>
                </button>
              </div>
            ` : `
              <div class="eko-reveal-box">
                <div class="reveal-cols">
                  <div class="rev-col">
                    <span class="rev-lbl">target echo</span>
                    <strong class="rev-val cyan">${lastRes.targetMs}<small>ms</small></strong>
                    <span class="rev-meter">${this.msToMeters(lastRes.targetMs)} meters</span>
                  </div>
                  <div class="rev-divider"></div>
                  <div class="rev-col">
                    <span class="rev-lbl">your echo</span>
                    <strong class="rev-val amber">${lastRes.guessMs}<small>ms</small></strong>
                    <span class="rev-meter">${this.msToMeters(lastRes.guessMs)} meters</span>
                  </div>
                </div>

                <div class="reveal-score-banner">
                  <span>error: <strong>±${lastRes.diffMs} ms</strong></span>
                  <span class="sep">•</span>
                  <strong class="pts">+${lastRes.score} pts</strong>
                </div>
              </div>
            `}

            <!-- Bottom Action Button inside Sculptural Frame -->
            <div class="eko-card-actions">
              ${this.phase === 'listen' ? `
                <button id="btn-eko-lock" class="white-pill-btn ${hasRec ? '' : 'btn-disabled'}" ${hasRec ? '' : 'disabled'}>
                  ${hasRec ? 'locked in, submit →' : 'hold pad to generate echo first'}
                </button>
              ` : this.phase === 'revealed' ? `
                <button id="btn-eko-next" class="white-pill-btn">
                  ${this.currentRound + 1 < TOTAL_ROUNDS ? 'next round →' : 'view daily score →'}
                </button>
              ` : `
                <button id="btn-eko-replay" class="subtle-pill-btn">
                  ↺ play again
                </button>
              `}
            </div>
          </div>
        </div>

        <div class="game-footer-bar">
          <div class="quick-tip">
            <strong>1.</strong> listen to target echo & remember delay &nbsp;•&nbsp; <strong>2.</strong> hold pad (or <strong>spacebar</strong>) for same duration &nbsp;•&nbsp; <strong>3.</strong> compare by ear and lock in
          </div>
        </div>
      </div>
    `;

    // Bind Target & User echo replay buttons
    this.container.querySelector('#btn-eko-target')?.addEventListener('click', () => {
      this.playCurrentTargetEcho();
    });

    this.container.querySelector('#btn-eko-user')?.addEventListener('click', () => {
      this.playRecordedEcho();
    });

    // Bind Tactile Hold Pad
    const padBtn = this.container.querySelector('#eko-pad-btn');
    if (padBtn) {
      padBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.startHold();
      });
      window.addEventListener('mouseup', () => {
        if (this.isHolding) this.endHold();
      }, { once: false });

      padBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.startHold();
      }, { passive: false });
      padBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (this.isHolding) this.endHold();
      }, { passive: false });
    }

    this.container.querySelector('#btn-eko-lock')?.addEventListener('click', () => this.submitGuess());
    this.container.querySelector('#btn-eko-next')?.addEventListener('click', () => this.nextRound());
    this.container.querySelector('#btn-eko-replay')?.addEventListener('click', () => this.resetBoard());
  }
}
