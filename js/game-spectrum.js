// MODÜL 08 — SPECTRUM (Spectrometer & Harmonic Scale Laboratory)
// Reorder scrambled optical wavelength tubes horizontally to form a continuous color spectrum & diatonic scale.

import { createRNG } from './rng.js';
import { sound } from './audio.js';

const SPECTRUM_DATA = [
  { id: 0, name: 'Violet', wave: '400 nm', freqTHz: '400 THz', audioFreq: 261.63, note: 'C4', color: '#8b5cf6', locked: true },
  { id: 1, name: 'Indigo', wave: '445 nm', freqTHz: '450 THz', audioFreq: 293.66, note: 'D4', color: '#6366f1', locked: false },
  { id: 2, name: 'Azure', wave: '485 nm', freqTHz: '500 THz', audioFreq: 329.63, note: 'E4', color: '#0ea5e9', locked: false },
  { id: 3, name: 'Cyan', wave: '525 nm', freqTHz: '550 THz', audioFreq: 349.23, note: 'F4', color: '#14b8a6', locked: false },
  { id: 4, name: 'Emerald', wave: '570 nm', freqTHz: '600 THz', audioFreq: 392.00, note: 'G4', color: '#22c55e', locked: false },
  { id: 5, name: 'Amber', wave: '625 nm', freqTHz: '670 THz', audioFreq: 440.00, note: 'A4', color: '#f59e0b', locked: false },
  { id: 6, name: 'Ruby', wave: '700 nm', freqTHz: '750 THz', audioFreq: 523.25, note: 'C5', color: '#ef4444', locked: true }
];

export class SpectrumGame {
  constructor(containerEl, onWinCallback) {
    this.container = containerEl;
    this.onWin = onWinCallback;

    this.seed = '';
    this.tubes = []; // array of tube objects currently in slots 0..6
    this.initialTubes = []; // initial scrambled snapshot for reset
    this.selectedTubeIdx = null; // for click-to-swap
    this.isPlayingSequence = false;
    this.activePlayingIdx = null;

    this.draggedIdx = null;
    this.dragStartX = 0;

    this.moves = 0;
    this.hintsUsed = 0;
    this.startTime = 0;
    this.solved = false;
    this.hintCooldownUntil = 0;
    this.hintCooldownTimer = null;
    this.sequenceTimer = null;
  }

  loadSeed(seedStr) {
    this.seed = seedStr;
    this.moves = 0;
    this.hintsUsed = 0;
    this.solved = false;
    this.startTime = Date.now();
    this.selectedTubeIdx = null;
    this.isPlayingSequence = false;
    this.activePlayingIdx = null;
    this.hintCooldownUntil = 0;
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (this.sequenceTimer) clearTimeout(this.sequenceTimer);
    this.hintCooldownTimer = null;
    this.sequenceTimer = null;

    this.generatePuzzle(seedStr);
    this.render();
  }

  generatePuzzle(seedStr) {
    const rng = createRNG(`SPECTRUM_V1_${seedStr}`);

    // Endpoints are fixed: index 0 (Violet) and index 6 (Ruby)
    const fixedStart = { ...SPECTRUM_DATA[0] };
    const fixedEnd = { ...SPECTRUM_DATA[6] };

    // Scramble the middle 5 tubes (indices 1..5)
    const middleTubes = SPECTRUM_DATA.slice(1, 6).map(t => ({ ...t }));

    let scrambled = [];
    let isAlreadySorted = true;
    let attempts = 0;

    do {
      scrambled = rng.shuffle(middleTubes);
      isAlreadySorted = scrambled.every((t, idx) => t.id === idx + 1);
      attempts++;
    } while (isAlreadySorted && attempts < 20);

    this.tubes = [fixedStart, ...scrambled, fixedEnd];
    this.initialTubes = this.tubes.map(t => ({ ...t }));
  }

  handleTubeClick(index) {
    if (this.solved) return;
    const clickedTube = this.tubes[index];

    // Always play the tube's frequency
    sound.playSpectrumTone(clickedTube.audioFreq, 0.35);

    if (clickedTube.locked) {
      this.selectedTubeIdx = null;
      this.render();
      return;
    }

    if (this.selectedTubeIdx === null) {
      // First click: select for swap
      this.selectedTubeIdx = index;
      this.render();
    } else if (this.selectedTubeIdx === index) {
      // Clicked same tube: deselect
      this.selectedTubeIdx = null;
      this.render();
    } else {
      // Second click: swap tubes!
      this.swapTubes(this.selectedTubeIdx, index);
      this.selectedTubeIdx = null;
    }
  }

  swapTubes(fromIdx, toIdx) {
    if (this.tubes[fromIdx].locked || this.tubes[toIdx].locked) return;

    sound.playGlassClink();
    this.moves++;

    const temp = this.tubes[fromIdx];
    this.tubes[fromIdx] = this.tubes[toIdx];
    this.tubes[toIdx] = temp;

    this.render();
    this.checkWinCondition();
  }

  checkWinCondition() {
    const isSorted = this.tubes.every((t, idx) => t.id === idx);

    if (isSorted && !this.solved) {
      this.solved = true;
      const notes = this.tubes.map(t => t.audioFreq);
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
      this.sequenceTimer = setTimeout(playNext, 190);
    };

    playNext();
  }

  giveHint() {
    if (this.solved) return;
    if (this.hintCooldownUntil && Date.now() < this.hintCooldownUntil) return;

    this.hintsUsed++;
    this.hintCooldownUntil = Date.now() + 3000;

    // Find the first tube that is out of order
    let targetIdx = -1;
    for (let i = 1; i < this.tubes.length - 1; i++) {
      if (this.tubes[i].id !== i) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx !== -1) {
      // Find where the tube with id == targetIdx currently is
      const currentPosOfCorrectTube = this.tubes.findIndex(t => t.id === targetIdx);
      if (currentPosOfCorrectTube !== -1) {
        this.swapTubes(targetIdx, currentPosOfCorrectTube);
      }
    } else {
      sound.playClick(600);
    }

    this.render();
  }

  resetPuzzle() {
    if (this.solved) return;
    sound.playClick(320);
    this.tubes = this.initialTubes.map(t => ({ ...t }));
    this.selectedTubeIdx = null;
    this.render();
  }

  destroy() {
    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (this.sequenceTimer) clearTimeout(this.sequenceTimer);
    this.hintCooldownTimer = null;
    this.sequenceTimer = null;
    this.isPlayingSequence = false;
  }

  getShareSummary() {
    const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const visualCells = this.tubes.map(t => ({
      type: t.id === 0 ? 'purple' : t.id === 6 ? 'coral' : 'blue',
      label: '❚'
    }));

    return {
      gameName: 'SPECTRUM',
      subtitle: '400-750 THz harmonic scale synthesized',
      seed: this.seed,
      moves: this.moves,
      hints: this.hintsUsed,
      timeSec: elapsedSec,
      stat1Label: 'time',
      stat1Value: `${elapsedSec}s`,
      stat2Label: 'moves',
      stat2Value: `${this.moves}`,
      stat3Label: 'harmonicity',
      stat3Value: '100%',
      gridCols: 7,
      visualCells,
      metricText: `${this.moves} moves • ${elapsedSec}s`,
      shareText: `focal • spectrum (${this.seed})\n⏱ ${elapsedSec}s | ${this.moves} moves\n🌈 pure color & tone scale locked`
    };
  }

  render() {
    const isCooldown = this.hintCooldownUntil && Date.now() < this.hintCooldownUntil;
    const remSec = isCooldown ? Math.max(0.1, (this.hintCooldownUntil - Date.now()) / 1000) : 0;

    let correctCount = 0;
    this.tubes.forEach((t, i) => {
      if (t.id === i) correctCount++;
    });

    const tubesHtml = this.tubes.map((tube, idx) => {
      const isSelected = this.selectedTubeIdx === idx;
      const isPlaying = this.activePlayingIdx === idx;
      const isCorrect = tube.id === idx;

      return `
        <div class="spectrum-tube ${tube.locked ? 'is-locked' : ''} ${isSelected ? 'is-selected' : ''} ${isPlaying ? 'is-playing' : ''} ${this.solved ? 'is-solved-tube' : ''}"
             data-index="${idx}"
             style="--tube-color: ${tube.color};">
          <div class="tube-top-cap">
            ${tube.locked ? '<span class="tube-lock-icon">🔒</span>' : `<span class="tube-slot-num">0${idx+1}</span>`}
          </div>

          <div class="tube-glass-chamber">
            <div class="tube-spectral-plasma" style="background: linear-gradient(180deg, ${tube.color} 0%, rgba(255,255,255,0.7) 50%, ${tube.color} 100%);"></div>
            <div class="tube-glass-shine"></div>
            <div class="tube-audio-wave"></div>
          </div>

          <div class="tube-bottom-info">
            <strong class="tube-freq">${tube.wave}</strong>
            <span class="tube-note">${tube.note}</span>
          </div>

          ${isSelected ? '<span class="tube-select-ring"></span>' : ''}
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="game-panel spectrum-panel ${this.solved ? 'is-solved' : ''}">
        <!-- Top HUD -->
        <div class="spectrum-hud">
          <div class="hud-card">
            <span class="hud-label">spectral resonance</span>
            <div class="hud-value ${correctCount === this.tubes.length ? 'ok' : ''}">
              ${correctCount} / ${this.tubes.length} <span style="font-size:12px;opacity:0.7;">aligned</span>
            </div>
          </div>

          <div class="hud-card" style="text-align: center;">
            <span class="hud-label">gamut coherence</span>
            <div class="status-pill ${this.solved ? 'solved' : ''}">
              ${this.solved ? '✓ PURE HARMONIC SPECTRUM' : 'REORDER WAVELENGTHS'}
            </div>
          </div>

          <div class="hud-card" style="text-align: right;">
            <span class="hud-label">transitions</span>
            <div class="hud-value">${this.moves} <span style="font-size:12px;opacity:0.7;">swaps</span></div>
          </div>
        </div>

        <!-- Continuous Spectral Beam Track (Shows seamless gradient when solved) -->
        <div class="spectrum-beam-track ${this.solved ? 'beam-aligned' : ''}">
          <div class="spectrum-laser-ribbon"></div>
        </div>

        <!-- Horizontal Optical Tubes Rack -->
        <div class="spectrum-rack-wrapper">
          <div class="spectrum-tubes-rack" id="spectrum-rack">
            ${tubesHtml}
          </div>
        </div>

        <!-- Middle Player Controls -->
        <div style="display: flex; justify-content: center; gap: 12px; margin: 4px 0 8px;">
          <button id="spectrum-play-seq-btn" class="subtle-pill-btn" ${this.isPlayingSequence ? 'disabled' : ''}
                  style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; font-size: 12px;">
            <span>${this.isPlayingSequence ? 'playing...' : '▶ listen spectrum sequence'}</span>
          </button>
        </div>

        <!-- Bottom Controls -->
        <div class="action-btns" style="justify-content: space-between; align-items: center; margin-top: 4px;">
          <button id="spectrum-reset-btn" class="btn-secondary" title="Reset spectrum rack">
            ↺ reset rack
          </button>

          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
            tap two tubes to swap • audition pure ascending scale
          </div>

          <button id="spectrum-hint-btn" class="btn-secondary btn-hint ${isCooldown ? 'cooldown-active' : ''}"
                  style="--cooldown-dur: ${remSec}s" ${isCooldown ? 'disabled' : ''}>
            <span class="btn-text">💡 hint (${this.hintsUsed})</span>
            <span class="btn-cooldown-wipe"></span>
          </button>
        </div>
      </div>
    `;

    // Attach click listeners to tubes
    this.container.querySelectorAll('.spectrum-tube').forEach(el => {
      const idx = parseInt(el.dataset.index, 10);
      el.addEventListener('click', () => this.handleTubeClick(idx));
    });

    this.container.querySelector('#spectrum-play-seq-btn')?.addEventListener('click', () => this.playFullSequence());
    this.container.querySelector('#spectrum-hint-btn')?.addEventListener('click', () => this.giveHint());
    this.container.querySelector('#spectrum-reset-btn')?.addEventListener('click', () => this.resetPuzzle());

    if (this.hintCooldownTimer) clearTimeout(this.hintCooldownTimer);
    if (isCooldown) {
      this.hintCooldownTimer = setTimeout(() => {
        const btn = this.container.querySelector('#spectrum-hint-btn');
        if (btn) {
          btn.classList.remove('cooldown-active');
          btn.removeAttribute('disabled');
        }
      }, remSec * 1000);
    }
  }
}
