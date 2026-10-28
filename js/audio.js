// Procedural Web Audio API Sound Engine (dialed.gg & tactile puzzle style)

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    // iOS reports 'interrupted' (not 'suspended') after a call, lock or app switch
    if (this.ctx && this.ctx.state !== 'running') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.playClick(600);
    }
    return this.enabled;
  }

  playClick(freq = 480, duration = 0.045, type = 'triangle', volume = 0.12) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.65, now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  // Error buzzer sound ("bzzzt") when a mistaken placement is corrected/highlighted
  playErrorBuzz() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.22);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  // DENGE: Placing a weight on the tilt board
  playWeightDrop(imbalanceMagnitude = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Lower pitch if heavily tilted, centered warm pitch when near balance
    const baseFreq = Math.max(130, 260 - imbalanceMagnitude * 18);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.09);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // SONAR: Acoustic ping + delayed echo reflection
  playSonarPing(distance, hasSecondaryEcho = false) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. Outgoing Transmitter Ping (t = 0)
    const pingOsc = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    pingOsc.type = 'sine';
    pingOsc.frequency.setValueAtTime(1320, now);
    pingOsc.frequency.exponentialRampToValueAtTime(1180, now + 0.09);

    pingGain.gain.setValueAtTime(0.18, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    pingOsc.connect(pingGain);
    pingGain.connect(this.ctx.destination);
    pingOsc.start(now);
    pingOsc.stop(now + 0.12);

    // 2. If target exists, schedule Echo Reflection at t = distance * 0.145s
    if (distance !== null && distance > 0) {
      const delaySec = distance * 0.145;
      const echoTime = now + delaySec;
      // Closer = slightly higher/brighter echo, farther = deeper echo
      const echoFreq = 1040 - (distance - 1) * 75;

      const echoOsc = this.ctx.createOscillator();
      const echoGain = this.ctx.createGain();

      echoOsc.type = 'sine';
      echoOsc.frequency.setValueAtTime(echoFreq, echoTime);
      echoOsc.frequency.exponentialRampToValueAtTime(echoFreq * 0.94, echoTime + 0.18);

      echoGain.gain.setValueAtTime(0.001, now);
      echoGain.gain.setValueAtTime(0.24, echoTime);
      echoGain.gain.exponentialRampToValueAtTime(0.001, echoTime + 0.22);

      echoOsc.connect(echoGain);
      echoGain.connect(this.ctx.destination);
      echoOsc.start(echoTime);
      echoOsc.stop(echoTime + 0.24);

      // Optional secondary echo blip if another submarine is behind it
      if (hasSecondaryEcho) {
        const secTime = echoTime + 0.12;
        const secOsc = this.ctx.createOscillator();
        const secGain = this.ctx.createGain();
        secOsc.type = 'triangle';
        secOsc.frequency.setValueAtTime(echoFreq * 1.25, secTime);
        secGain.gain.setValueAtTime(0.11, secTime);
        secGain.gain.exponentialRampToValueAtTime(0.001, secTime + 0.14);
        secOsc.connect(secGain);
        secGain.connect(this.ctx.destination);
        secOsc.start(secTime);
        secOsc.stop(secTime + 0.15);
      }
    } else {
      // Empty water: subtle low hollow dissipation after 0.35s
      const missTime = now + 0.28;
      const missOsc = this.ctx.createOscillator();
      const missGain = this.ctx.createGain();
      missOsc.type = 'sine';
      missOsc.frequency.setValueAtTime(290, missTime);
      missOsc.frequency.exponentialRampToValueAtTime(160, missTime + 0.22);
      missGain.gain.setValueAtTime(0.07, missTime);
      missGain.gain.exponentialRampToValueAtTime(0.001, missTime + 0.24);
      missOsc.connect(missGain);
      missGain.connect(this.ctx.destination);
      missOsc.start(missTime);
      missOsc.stop(missTime + 0.25);
    }
  }

  // RESONANCE: Phase placement (+ or -)
  playPhaseTone(phase) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (phase === 1) {
      // Positive Crest (+): Bright Cyan 528 Hz
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);
    } else if (phase === -1) {
      // Negative Trough (-): Warm Amber 396 Hz
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(396, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.08);
    } else {
      this.playClick(300, 0.03);
      return;
    }

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  // Subtle harmonic lock when a row/col or axis balances
  playHarmonicLock(index = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const freq = scale[index % scale.length];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // EKO (Game 4): Pure Time-of-Flight Echo Reflection (delayMs in milliseconds)
  playEchoPulse(delayMs = 500) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const delaySec = Math.max(0.08, delayMs / 1000);

    // 1. Outgoing sharp acoustic pulse (t = 0)
    const outOsc = this.ctx.createOscillator();
    const outGain = this.ctx.createGain();
    outOsc.type = 'sine';
    outOsc.frequency.setValueAtTime(980, now);
    outOsc.frequency.exponentialRampToValueAtTime(880, now + 0.055);

    outGain.gain.setValueAtTime(0.24, now);
    outGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    outOsc.connect(outGain);
    outGain.connect(this.ctx.destination);
    outOsc.start(now);
    outOsc.stop(now + 0.07);

    // 2. Returning bounced echo at t = now + delaySec
    const echoTime = now + delaySec;
    const echoOsc = this.ctx.createOscillator();
    const echoGain = this.ctx.createGain();

    // Slightly warmer/filtered reflection tone
    echoOsc.type = 'sine';
    echoOsc.frequency.setValueAtTime(920, echoTime);
    echoOsc.frequency.exponentialRampToValueAtTime(790, echoTime + 0.11);

    // Attenuation with distance, but still clearly audible
    const echoVol = Math.max(0.08, 0.22 - (delayMs / 1400) * 0.1);
    echoGain.gain.setValueAtTime(0.0001, now);
    echoGain.gain.setValueAtTime(echoVol, echoTime);
    echoGain.gain.exponentialRampToValueAtTime(0.001, echoTime + 0.14);

    echoOsc.connect(echoGain);
    echoGain.connect(this.ctx.destination);
    echoOsc.start(echoTime);
    echoOsc.stop(echoTime + 0.15);
  }

  // PRISM (Game 5): Optical glass mirror rotation click
  playPrismRotate() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.038);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  // PRISM: Laser ray locks onto sensor
  playPrismSensorHit() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [1200, 2400];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.98, now + 0.45);

      const vol = idx === 0 ? 0.22 : 0.08;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.52);
    });
  }

  // KNOT (Game 6): Parasitic static hum while lines are entangled
  playKnotHum(intersectionCount = 1) {
    if (!this.enabled || intersectionCount <= 0) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Subtle low buzz
    osc.type = 'sawtooth';
    const baseFreq = 85 + Math.min(12, intersectionCount) * 8;
    osc.frequency.setValueAtTime(baseFreq, now);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // KNOT: Relief tone when intersection count drops
  playKnotRelief(intersectionsLeft = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freq = Math.max(220, 680 - intersectionsLeft * 38);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + 0.18);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // KNOT: Pure harmonic lock when 0 intersections achieved
  playKnotLock() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const chord = [392.00, 493.88, 587.33, 783.99]; // G Major spread
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.14, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + 0.75);
    });
  }

  // CIRCUIT (Game 7): Solid electromechanical relay click
  playRelayClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Transient impulse
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(920, now);
    osc1.frequency.exponentialRampToValueAtTime(240, now + 0.025);
    gain1.gain.setValueAtTime(0.14, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.03);

    // Mechanical snap body (delayed by 8ms)
    const t2 = now + 0.008;
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(280, t2);
    osc2.frequency.exponentialRampToValueAtTime(110, t2 + 0.04);
    gain2.gain.setValueAtTime(0.2, t2);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t2);
    osc2.stop(t2 + 0.05);
  }

  // CIRCUIT: Voltage chirp when power connects to more tiles
  playVoltageChirp(level = 1) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const startFreq = 340 + Math.min(level, 16) * 32;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.35, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // CIRCUIT: Transformer surge on complete circuit
  playCircuitHum() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(60, now);
    osc1.frequency.linearRampToValueAtTime(120, now + 0.5);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(180, now);
    osc2.frequency.linearRampToValueAtTime(240, now + 0.5);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.65);
    osc2.stop(now + 0.65);
  }

  // SPECTRUM (Game 8): Pure sine tone for frequency tubes
  playSpectrumTone(freq = 440, duration = 0.32) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Warm envelope: soft attack, sustained body, soft release
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.setValueAtTime(0.2, now + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // SPECTRUM: Tactile glass clink on tube swap
  playGlassClink() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1540, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.05);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // SPECTRUM: Arpeggio glissando through all tubes on win
  playSpectrumGlissando(notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 523.25]) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.07;
      const dur = 0.45;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  // Victory Chord!
  playVictory() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Lush Cmaj9 arpeggio chord
    const notes = [261.63, 329.63, 392.00, 493.88, 587.33, 659.25];
    notes.forEach((freq, i) => {
      const start = now + i * 0.065;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.95);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 1.0);
    });
  }
}

export const sound = new SoundEngine();
