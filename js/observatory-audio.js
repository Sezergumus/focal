// Observatory Audio Engine
// Every sound the games ask for is re-voiced here as a soft, warm note taken from today's
// pentatonic scale (see atmosphere.js). Nothing buzzes, nothing is shrill:
//   voice -> master bus (gain) -> low-pass ~2.8 kHz -> soft limiter -> speakers
// Because every scale is semitone-free, overlapping notes always sit well together.

import { sound } from './audio.js';
import { atmosphere } from './atmosphere.js';

const MAX_VOICES = 28;
const AMBIENT_KEY = 'focal_ambient';
const AMBIENT_VOL_KEY = 'focal_ambient_volume';

// Melodic motifs (scale degrees) for the sweet music-box / celesta ambient generator.
// Pentatonic degrees: 0 = root, 1 = 2nd, 2 = 3rd, 3 = 5th, 4 = 6th, 5 = octave, 6 = 9th, 7 = 10th
const SWEET_MOTIFS = [
  [0, 2, 3, 5],
  [3, 4, 5, 3],
  [5, 4, 2, 0],
  [0, 3, 4, 5],
  [2, 3, 5, 6],
  [5, 3, 2, 1, 0],
  [0, 1, 2, 4, 3],
  [3, 2, 0, -1, 0],
  [2, 4, 5, 4, 2]
];

class ObservatorySoundEngine {
  constructor() {
    this.originalEngine = sound;
    this.bus = null;
    this.busCtx = null;
    this.activeVoices = 0;
    this.applyGentleOverrides();
  }

  // Lazily (re)build the shared output chain for the current AudioContext.
  getBus() {
    const orig = this.originalEngine;
    orig.init();
    const ctx = orig.ctx;
    if (!ctx) return null;
    if (this.bus && this.busCtx === ctx) return this.bus;

    const master = ctx.createGain();
    master.gain.value = 0.72;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2800;
    lowpass.Q.value = 0.45;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -20;
    limiter.knee.value = 24;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.25;

    master.connect(lowpass);
    lowpass.connect(limiter);
    limiter.connect(ctx.destination);

    this.bus = master;
    this.busCtx = ctx;
    return master;
  }

  // One soft note. `degree` is a scale step of today's theme (0 = root, negative = below).
  // Options: gain, decay (s), attack (s), when (s from now), glide (end/start pitch ratio),
  //          dest (custom audio node), partials (custom harmonic array), freqMul (octave shift).
  note(degree, opts = {}) {
    const orig = this.originalEngine;
    if (!orig.enabled) return;
    const bus = opts.dest || this.getBus();
    if (!bus || this.activeVoices >= MAX_VOICES) return;

    const theme = atmosphere.theme;
    const timbre = theme.timbre;
    const ctx = orig.ctx;
    const freq = atmosphere.noteFreq(degree, theme) * (opts.freqMul ?? 1);
    const gainPeak = Math.min(opts.gain ?? 0.09, 0.16);
    const attack = Math.max(0.008, opts.attack ?? timbre.attack);
    const decay = opts.decay ?? timbre.decay;
    const start = ctx.currentTime + (opts.when ?? 0);
    const end = start + attack + decay;
    const partials = opts.partials || (opts.pure ? [[1, 1]] : timbre.partials);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(gainPeak, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(bus);

    this.activeVoices += 1;
    let remaining = partials.length;

    partials.forEach(([ratio, amp]) => {
      const f = freq * ratio;
      if (f > 2800 || f < 35) {
        remaining -= 1;
        return;
      }
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * (opts.glide ? 1 / opts.glide : 1), start);
      if (opts.glide) osc.frequency.exponentialRampToValueAtTime(f, start + Math.min(0.12, decay));
      g.gain.value = amp;
      osc.connect(g);
      g.connect(env);
      osc.start(start);
      osc.stop(end + 0.06);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
        remaining -= 1;
        if (remaining <= 0) {
          env.disconnect();
          this.activeVoices = Math.max(0, this.activeVoices - 1);
        }
      };
    });

    if (remaining <= 0) {
      env.disconnect();
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }
  }

  // Map an arbitrary legacy pitch (Hz) onto the nearest step of today's scale.
  degreeForFreq(freq) {
    const t = atmosphere.theme;
    const perOctave = t.scale.length;
    const rootHz = t.root * t.reg;
    const raw = Math.log2(Math.max(60, freq) / rootHz) * perOctave;
    return Math.max(-5, Math.min(8, Math.round(raw)));
  }

  applyGentleOverrides() {
    const orig = this.originalEngine;
    const self = this;

    // Soft tick for UI and board taps (callers pass their own pitch; we snap it to the scale)
    orig.playClick = (freq = 480, duration = 0.05, _type, volume = 0.08) => {
      self.note(self.degreeForFreq(freq), {
        gain: Math.min(volume * 0.7, 0.07),
        decay: Math.min(0.22, 0.1 + duration),
        pure: true
      });
    };

    // A mistake is a quiet wooden "tok" one octave under the root. Never a buzzer.
    orig.playErrorBuzz = () => {
      self.note(-5, { gain: 0.1, attack: 0.012, decay: 0.28, glide: 1.12, pure: true });
    };

    // DENGE: weight settles lower the heavier the tilt
    orig.playWeightDrop = (imbalanceMagnitude = 0) => {
      const step = Math.min(4, Math.round(imbalanceMagnitude / 2));
      self.note(-step, { gain: 0.1, decay: 0.32, glide: 1.1 });
    };

    // SONAR: soft ping, then an echo whose pitch falls with distance (timing is unchanged)
    orig.playSonarPing = (distance, hasSecondaryEcho = false) => {
      self.note(4, { gain: 0.08, decay: 0.3 });
      if (distance !== null && distance > 0) {
        const delay = distance * 0.145;
        const echoDegree = Math.max(0, 4 - Math.round(distance - 1));
        self.note(echoDegree, { gain: 0.085, decay: 0.45, when: delay });
        if (hasSecondaryEcho) {
          self.note(echoDegree + 2, { gain: 0.05, decay: 0.35, when: delay + 0.12 });
        }
      } else {
        self.note(-2, { gain: 0.045, decay: 0.4, when: 0.28, pure: true });
      }
    };

    // RESONANCE: crest = a step up the scale, trough = a step down; both always consonant
    orig.playPhaseTone = (phase) => {
      if (phase === 1) self.note(6, { gain: 0.085, decay: 0.3 });
      else if (phase === -1) self.note(1, { gain: 0.085, decay: 0.3 });
      else orig.playClick(300, 0.03);
    };

    // A little chime when a row, column or axis settles
    orig.playHarmonicLock = (index = 0) => {
      self.note((((index % 6) + 6) % 6) + 1, { gain: 0.075, decay: 0.55 });
    };

    // EKO: outgoing call and its returning echo (delay is exact; the echo is softer and a step lower)
    orig.playEchoPulse = (delayMs = 500) => {
      const delaySec = Math.max(0.08, delayMs / 1000);
      const echoGain = Math.max(0.05, 0.095 - (delayMs / 1400) * 0.04);
      self.note(4, { gain: 0.095, attack: 0.006, decay: 0.22 });
      self.note(3, { gain: echoGain, attack: 0.006, decay: 0.34, when: delaySec });
    };

    // Hover whisper on cards
    orig.playAmbientChime = (freq = 440) => {
      self.note(self.degreeForFreq(freq), { gain: 0.035, attack: 0.03, decay: 0.55, pure: true });
    };

    // Victory: a slow, rising arpeggio in today's scale
    orig.playVictory = () => {
      [0, 1, 2, 3, 4, 5, 7].forEach((degree, i) => {
        self.note(degree, { gain: 0.07, decay: 1.4, when: i * 0.11 });
      });
    };

    // PRISM: Gentle celesta rotation chime
    orig.playPrismRotate = () => {
      self.note(3, { gain: 0.065, attack: 0.008, decay: 0.24, pure: true });
    };

    // PRISM: Starlight sensor catch bloom
    orig.playPrismSensorHit = () => {
      self.note(4, { gain: 0.08, attack: 0.01, decay: 0.65 });
      self.note(6, { gain: 0.05, attack: 0.01, decay: 0.75, when: 0.06 });
    };

    // KNOT: Soft low register murmur (never a harsh buzzer or saw wave)
    orig.playKnotHum = (intersectionCount = 1) => {
      if (intersectionCount <= 0) return;
      self.note(-4, { gain: 0.03, attack: 0.02, decay: 0.22, pure: true });
    };

    // KNOT: Relief tone when lines untangle
    orig.playKnotRelief = (intersectionsLeft = 0) => {
      const step = Math.max(-2, Math.min(5, 5 - Math.round(intersectionsLeft)));
      self.note(step, { gain: 0.08, attack: 0.01, decay: 0.35, glide: 1.05 });
    };

    // KNOT: Serene lock chord when all lines untangle
    orig.playKnotLock = () => {
      [0, 2, 4, 5].forEach((degree, idx) => {
        self.note(degree, { gain: 0.07, attack: 0.015, decay: 1.2, when: idx * 0.06 });
      });
    };

    // CIRCUIT: Soft wooden & brass latch tap
    orig.playRelayClick = () => {
      self.note(1, { gain: 0.06, attack: 0.005, decay: 0.14, pure: true });
    };

    // CIRCUIT: Rising harp chirp as current reaches more lanterns
    orig.playVoltageChirp = (level = 1) => {
      const degree = Math.min(6, Math.floor(level / 2));
      self.note(degree, { gain: 0.07, attack: 0.008, decay: 0.28, pure: true });
    };

    // CIRCUIT: Deep warm chord swell when all lanterns connect
    orig.playCircuitHum = () => {
      [-2, 0, 2, 4].forEach((deg, idx) => {
        self.note(deg, { gain: 0.065, attack: 0.04, decay: 1.3, when: idx * 0.05 });
      });
    };

    // SPECTRUM: Singing glass vial tone
    orig.playSpectrumTone = (freq = 440, duration = 0.32) => {
      const deg = self.degreeForFreq(freq);
      self.note(deg, { gain: 0.085, attack: 0.018, decay: Math.max(0.35, duration + 0.1) });
    };

    // SPECTRUM: Crystal clink on swap
    orig.playGlassClink = () => {
      self.note(5, { gain: 0.07, attack: 0.004, decay: 0.22, pure: true });
    };

    // SPECTRUM: Harp arpeggio sweep across the sorted gamut
    orig.playSpectrumGlissando = (notes = []) => {
      notes.forEach((freq, idx) => {
        const deg = self.degreeForFreq(freq);
        self.note(deg, { gain: 0.07, attack: 0.012, decay: 0.9, when: idx * 0.08 });
      });
    };
  }
}

// --- Sweet Melodic Ambient Bed --------------------------------------------------------------
// Replaces the old static sine drone & brown-noise hiss with a warm, soothing, Ghibli/lullaby-like
// generative music box & felt-piano atmosphere:
//   1. Soft, dreamy echo space (warm low-passed delay) so every note floats gently
//   2. Delicate pentatonic melodic phrases & arpeggios (celesta / music box / warm harp)
//   3. Breathing warm low-register chord swells (no continuous static hum or noise hiss)
//   4. Smooth user-adjustable volume control (0.0 - 1.0) persisted in localStorage
class AmbientBed {
  constructor(engine) {
    this.engine = engine;
    this.orig = engine.originalEngine;
    this.enabled = false;
    this.volume = 0.33; // 0.0 .. 1.0 default sweet spot: 33%
    this.gestureSeen = false;
    this.nodes = null;
    this.phraseTimer = null;
    this.swellTimer = null;
    this.motifIndex = Math.floor(Math.random() * SWEET_MOTIFS.length);

    try {
      this.enabled = localStorage.getItem(AMBIENT_KEY) === '1';
      const savedVol = parseFloat(localStorage.getItem(AMBIENT_VOL_KEY));
      // If user had previous hardcoded default of 0.55 or no valid value, update to 0.33
      if (Number.isFinite(savedVol) && Math.abs(savedVol - 0.55) > 0.001) {
        this.volume = Math.max(0, Math.min(1, savedVol));
      } else {
        this.volume = 0.33;
      }
    } catch {
      this.enabled = false;
      this.volume = 0.33;
    }

    // Browsers only allow audio after a user gesture; start remembered ambience on the first one.
    const onFirstGesture = () => {
      if (this.gestureSeen) return;
      this.gestureSeen = true;
      this.sync();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', onFirstGesture, { once: true });
      window.addEventListener('keydown', onFirstGesture, { once: true });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.sync());
    }
    atmosphere.onChange(() => this.retune());
  }

  toggle() {
    this.gestureSeen = true;
    this.enabled = !this.enabled;
    if (this.enabled && this.volume < 0.05) {
      this.volume = 0.33;
    }
    this.saveState();
    this.sync();
    return this.enabled;
  }

  setVolume(val) {
    this.gestureSeen = true;
    const clamped = Math.max(0, Math.min(1, Number(val) || 0));
    this.volume = clamped;

    if (clamped > 0 && !this.enabled) {
      this.enabled = true;
    } else if (clamped === 0 && this.enabled) {
      this.enabled = false;
    }

    this.saveState();
    this.sync();

    if (this.nodes && this.orig.ctx) {
      const now = this.orig.ctx.currentTime;
      const targetGain = this.computeMasterGain();
      this.nodes.out.gain.cancelScheduledValues(now);
      this.nodes.out.gain.setTargetAtTime(targetGain, now, 0.08);
    }
  }

  computeMasterGain() {
    // Non-linear perceptual curve so low settings are whisper-soft and 100% is lush but never clipping
    return Math.pow(this.volume, 1.35) * 1.45;
  }

  saveState() {
    try {
      localStorage.setItem(AMBIENT_KEY, this.enabled ? '1' : '0');
      localStorage.setItem(AMBIENT_VOL_KEY, String(this.volume));
    } catch {
      // ignore storage errors
    }
  }

  shouldPlay() {
    return this.enabled && this.volume > 0 && this.orig.enabled && this.gestureSeen && !document.hidden;
  }

  sync() {
    if (this.shouldPlay()) this.start();
    else this.stop();
  }

  start() {
    if (this.nodes) return;
    const bus = this.engine.getBus();
    const ctx = this.orig.ctx;
    if (!bus || !ctx) return;

    const now = ctx.currentTime;
    const out = ctx.createGain();
    const targetGain = Math.max(0.0001, this.computeMasterGain());
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(targetGain, now + 1.8);
    out.connect(bus);

    // Warm, velvety low-pass filter + dreamy echo delay loop for the ambient melody bus
    const melodyInput = ctx.createGain();
    melodyInput.gain.value = 1.0;

    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 1550;
    toneFilter.Q.value = 0.35;

    // Gentle dual-tap echo (creates a cozy music-box / studio reverb tail without mud)
    const delayA = ctx.createDelay(2.0);
    delayA.delayTime.value = 0.42;

    const delayB = ctx.createDelay(2.0);
    delayB.delayTime.value = 0.68;

    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 980;

    const echoFeedback = ctx.createGain();
    echoFeedback.gain.value = 0.28;

    const echoWet = ctx.createGain();
    echoWet.gain.value = 0.38;

    melodyInput.connect(toneFilter);
    toneFilter.connect(out); // dry warm signal

    // Echo send & feedback
    toneFilter.connect(delayA);
    delayA.connect(echoFilter);
    echoFilter.connect(echoWet);
    echoFilter.connect(delayB);
    delayB.connect(echoFeedback);
    echoFeedback.connect(delayA);
    echoWet.connect(out);

    this.nodes = {
      out,
      melodyInput,
      chain: [melodyInput, toneFilter, delayA, delayB, echoFilter, echoFeedback, echoWet]
    };

    // Play an immediate gentle welcoming chord & schedule ongoing phrases
    this.playWarmPadBreath(0.15);
    this.scheduleNextPhrase(900);
    this.scheduleNextSwell(5500);
  }

  // Soft, breathing felt-pad chord that swells in and fades out completely (never a static drone)
  playWarmPadBreath(delaySec = 0) {
    if (!this.nodes || !this.orig.ctx) return;
    const theme = atmosphere.theme;
    // Choose a warm, grounding root+fifth+ninth voicing in a low-mid cozy register
    const freqMul = theme.root * theme.reg > 280 ? 0.5 : 0.5;
    const chordSets = [
      [0, 3, 5],    // root, 5th, octave
      [-2, 0, 2],   // 6th below, root, 3rd (warm relative minor/major feel)
      [0, 2, 4],    // root, 3rd, 6th
      [-1, 2, 3]    // 5th below, 3rd, 5th
    ];
    const chord = chordSets[Math.floor(Math.random() * chordSets.length)];

    chord.forEach((deg, idx) => {
      this.engine.note(deg, {
        dest: this.nodes.melodyInput,
        freqMul,
        gain: idx === 0 ? 0.028 : 0.022,
        attack: 2.2 + idx * 0.35,
        decay: 4.8 + idx * 0.4,
        when: delaySec + idx * 0.18,
        partials: [[1, 1], [2, 0.12]]
      });
    });
  }

  // Delicate music-box / celesta / harp phrase
  playSweetPhrase() {
    if (!this.nodes || !this.orig.ctx) return;
    const theme = atmosphere.theme;
    // Keep the melody in a sweet, warm middle register (never piercing high)
    const baseFreq = theme.root * theme.reg;
    const freqMul = baseFreq > 350 ? 0.5 : baseFreq < 190 ? 1.0 : 1.0;

    const motif = SWEET_MOTIFS[this.motifIndex % SWEET_MOTIFS.length];
    this.motifIndex += 1 + (Math.random() < 0.35 ? 1 : 0);

    // Soft bass root / fifth cradle note underneath the phrase
    const bassDeg = Math.random() < 0.65 ? 0 : -2;
    this.engine.note(bassDeg, {
      dest: this.nodes.melodyInput,
      freqMul: freqMul * 0.5,
      gain: 0.042,
      attack: 0.06,
      decay: 2.8,
      when: 0,
      partials: [[1, 1], [2, 0.18]]
    });

    // Gently arpeggiated melody notes with human-like timing & soft bell overtone
    let cursor = 0.22;
    motif.forEach((deg, i) => {
      const isLast = i === motif.length - 1;
      const stepWait = 0.46 + Math.random() * 0.22;
      this.engine.note(deg, {
        dest: this.nodes.melodyInput,
        freqMul,
        gain: isLast ? 0.052 : 0.045,
        attack: 0.028,
        decay: isLast ? 2.6 : 1.65,
        when: cursor,
        partials: [[1, 1], [2, 0.22], [3, 0.04]]
      });
      cursor += stepWait;
    });
  }

  scheduleNextPhrase(initialWaitMs = null) {
    clearTimeout(this.phraseTimer);
    if (!this.nodes) return;
    const wait = initialWaitMs ?? (3800 + Math.random() * 2400);
    this.phraseTimer = setTimeout(() => {
      if (!this.nodes) return;
      this.playSweetPhrase();
      this.scheduleNextPhrase();
    }, wait);
  }

  scheduleNextSwell(initialWaitMs = null) {
    clearTimeout(this.swellTimer);
    if (!this.nodes) return;
    const wait = initialWaitMs ?? (7500 + Math.random() * 3500);
    this.swellTimer = setTimeout(() => {
      if (!this.nodes) return;
      this.playWarmPadBreath(0);
      this.scheduleNextSwell();
    }, wait);
  }

  retune() {
    // Next scheduled phrase & breath automatically pick up the updated atmosphere.theme
  }

  stop() {
    clearTimeout(this.phraseTimer);
    clearTimeout(this.swellTimer);
    this.phraseTimer = null;
    this.swellTimer = null;
    if (!this.nodes) return;
    const ctx = this.orig.ctx;
    const nodes = this.nodes;
    this.nodes = null;
    if (!ctx) return;

    const now = ctx.currentTime;
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(nodes.out.gain.value, 0.0001), now);
    nodes.out.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    setTimeout(() => {
      nodes.chain.forEach((node) => {
        try { node.disconnect(); } catch { /* ignore */ }
      });
      try { nodes.out.disconnect(); } catch { /* ignore */ }
    }, 1000);
  }
}

export const observatorySound = new ObservatorySoundEngine();
export const ambient = new AmbientBed(observatorySound);
export { sound };
