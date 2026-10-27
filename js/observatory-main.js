// Observatory Main Controller
// Narrative & sensory atmosphere for FOCAL: The Gentle Observatory.
// A calm hilltop observatory where the player (the Observer) tunes four instruments each day.

import { getTodayDateString, getDailyIssueNumber, getMidnightCountdown, getRandomArchiveSeed, formatSeedLabel } from './rng.js';
import { observatorySound, sound, ambient } from './observatory-audio.js';
import { atmosphere } from './atmosphere.js';
import { DengeGame } from './game-denge.js';
import { SonarGame } from './game-sonar.js';
import { ResonanceGame } from './game-resonance.js';
import { EkoGame } from './game-eko.js';
import { PrismGame } from './game-prism.js';
import { KnotGame } from './game-knot.js';
import { CircuitGame } from './game-circuit.js';
import { SpectrumGame } from './game-spectrum.js';

const GAME_KEYS = ['denge', 'sonar', 'resonance', 'eko', 'prism', 'knot', 'circuit', 'spectrum'];

const OBSERVATORY_LORE = {
  denge: {
    station: 'Instrument 01 · Mass & Pendulum',
    lore: 'Find the center point. When the weights settle, the wood begins to breathe.',
    coords: 'Lat 41.0082° N · first window',
    howTo: {
      title: '01 · Balance',
      subtitle: 'No math at all: just feel where the weight wants to rest.',
      steps: [
        { icon: '01', heading: 'Place three colored weights', text: 'The blue weight is already resting on the board. Give each of the other three colored regions one weight of its own.' },
        { icon: '02', heading: 'Keep them apart', text: 'Weights cannot touch, not even at the corners. Tap another square of the same color to carry a weight over to it.' },
        { icon: '03', heading: 'Settle the center', text: 'Hover over a square to preview where the center of mass will drift. Coax the little bubble into the quiet ring in the middle.' }
      ]
    }
  },
  sonar: {
    station: 'Instrument 02 · Deep Water Acoustics',
    lore: 'Send a whisper into deep water. Wait for the echo to find its way back.',
    coords: 'Depth 120 m · second window',
    howTo: {
      title: '02 · Sonar',
      subtitle: 'Seven soft pings, five boats resting somewhere in the dark.',
      steps: [
        { icon: '01', heading: 'Read the sector badges', text: 'The sea is divided into four 3×3 sectors. Each badge tells you how many boats are resting inside.' },
        { icon: '02', heading: 'Mind the acoustic shadow', text: 'A ping sent from the shore only echoes off the first boat it meets. Anything behind it stays in shadow.' },
        { icon: '03', heading: 'Trust your ear', text: 'Boats never touch, not even at the corners. Spend your seven pings wisely and mark where all five boats rest.' }
      ]
    }
  },
  resonance: {
    station: 'Instrument 03 · Light & Phase',
    lore: 'Guide the beam of light. When the mirrors find the right angle, the room will glow.',
    coords: 'Frequency 528 Hz · third window',
    howTo: {
      title: '03 · Resonance',
      subtitle: 'Three crests and three troughs, in every row and every column.',
      steps: [
        { icon: '01', heading: 'Three crests, three troughs', text: 'Every row and every column needs exactly three blue crests (∿+) and three amber troughs (∿−).' },
        { icon: '02', heading: 'No three alike', text: 'No more than two matching waves may sit side by side, in a row or in a column.' },
        { icon: '03', heading: 'Follow the connectors', text: 'An "=" between two squares means the same wave; an "×" means opposite waves.' }
      ]
    }
  },
  eko: {
    station: 'Instrument 04 · The Rhythm of Distance',
    lore: 'Listen to the rhythm of time and distance.',
    coords: 'Speed of sound 340 m/s · fourth window',
    howTo: {
      title: '04 · Echo',
      subtitle: 'A listening game: hold the pad to recreate the echo you heard.',
      steps: [
        { icon: '01', heading: 'Listen to the target echo', text: 'Play the target echo and notice the quiet stretch between the call and its answer. Keep that silence in your mind.' },
        { icon: '02', heading: 'Hold, then release', text: 'Press and hold the pad (or the Space bar) for exactly as long as that silence lasted. Your own echo plays the moment you let go.' },
        { icon: '03', heading: 'Compare by ear, then confirm', text: 'Listen to both once more. When they feel like the same distance, confirm your echo.' }
      ]
    }
  },
  prism: {
    station: 'Instrument 05 · Light & Prism',
    lore: 'Direct the stray beam of light. When the mirrors find the right angle, the room will glow.',
    coords: 'Wavelength 488 nm · fifth window',
    howTo: {
      title: '05 · Prism',
      subtitle: 'Guide the sunbeam across the crystals to kindle every sensor.',
      steps: [
        { icon: '01', heading: 'The beam of light', text: 'A single warm ray streams from the emitter. Turn the mirrors to guide its path across the chamber.' },
        { icon: '02', heading: 'Turn the mirrors', text: 'Tap any mirror to turn it 90° clockwise. Each mirror deflects the beam at a clean right angle.' },
        { icon: '03', heading: 'Kindle all sensors', text: 'Obstacles absorb the light. Weave the ray through the room until all target crystals glow with warm amber light.' }
      ]
    }
  },
  knot: {
    station: 'Instrument 06 · Thread & Constellation',
    lore: 'Gently part the entangled threads. When the stars find their peaceful places, the wind falls still.',
    coords: 'Right Ascension 18h · sixth window',
    howTo: {
      title: '06 · Knot',
      subtitle: 'Untangle the silken threads of the constellation until no lines cross.',
      steps: [
        { icon: '01', heading: 'Silken signal threads', text: 'Each star is tied to its neighbors by glowing threads. When two threads cross, a soft interference ripple appears.' },
        { icon: '02', heading: 'Glide the stars', text: 'Drag the glowing stars gently across the sky to untangle overlapping threads.' },
        { icon: '03', heading: 'Stillness in the sky', text: 'When all crossings disappear, parazitic noise ceases completely and the constellation settles into quiet harmony.' }
      ]
    }
  },
  circuit: {
    station: 'Instrument 07 · Current & Conduit',
    lore: 'Trace the warmth through the brass pipes. Every lamp in the observatory yearns to be lit.',
    coords: 'Flux 2.4 Tesla · seventh window',
    howTo: {
      title: '07 · Circuit',
      subtitle: 'Rotate the brass conduits to light every lantern with zero leaking current.',
      steps: [
        { icon: '01', heading: 'The dynamo core', text: 'Warm current flows outward from the station dynamo. Trace its path through the connected conduits.' },
        { icon: '02', heading: 'Turn the conduit tiles', text: 'Tap any tile to rotate its pathways 90°. When opposite brass ports meet, current flows quietly through.' },
        { icon: '03', heading: 'Kindle all lamps', text: 'Guide the current to all target lamps without leaving any open, leaking pipe ends spilling into the dark.' }
      ]
    }
  },
  spectrum: {
    station: 'Instrument 08 · Color & Gamut',
    lore: 'From the violet of dusk to the crimson of morning, let each color chime in harmony.',
    coords: '400-750 THz · eighth window',
    howTo: {
      title: '08 · Spectrum',
      subtitle: 'Arrange the glass vials of starlight into a smooth ascending melody.',
      steps: [
        { icon: '01', heading: 'The anchor vials', text: 'The leftmost vial (Violet / dusk / C4) and rightmost vial (Ruby / dawn / C5) are locked in place.' },
        { icon: '02', heading: 'Swap intermediate vials', text: 'Tap a vial to hear its singing tone. Tap a second vial to exchange their places.' },
        { icon: '03', heading: 'Listen to the sequence', text: 'Tap "Listen Spectrum Sequence" to play the rack from left to right. Arrange the colors so the melody rises without dissonance.' }
      ]
    }
  }
};

const MODULE_NAMES = {
  denge: '01 Balance',
  sonar: '02 Sonar',
  resonance: '03 Resonance',
  eko: '04 Echo',
  prism: '05 Prism',
  knot: '06 Knot',
  circuit: '07 Circuit',
  spectrum: '08 Spectrum'
};

const ROUTE_ALIASES = {
  '': 'hub',
  '#': 'hub',
  '#hub': 'hub',
  '#balance': 'denge',
  '#denge': 'denge',
  '#sonar': 'sonar',
  '#resonance': 'resonance',
  '#echo': 'eko',
  '#eko': 'eko',
  '#prism': 'prism',
  '#prizma': 'prism',
  '#knot': 'knot',
  '#dugum': 'knot',
  '#circuit': 'circuit',
  '#devre': 'circuit',
  '#spectrum': 'spectrum',
  '#spektrum': 'spectrum'
};

const GAME_TO_HASH = {
  hub: '#hub',
  denge: '#balance',
  sonar: '#sonar',
  resonance: '#resonance',
  eko: '#echo',
  prism: '#prism',
  knot: '#knot',
  circuit: '#circuit',
  spectrum: '#spectrum'
};

const PAGE_TITLES = {
  hub: 'Focal - The Gentle Observatory',
  denge: 'Focal · 01 Balance - The Gentle Observatory',
  sonar: 'Focal · 02 Sonar - The Gentle Observatory',
  resonance: 'Focal · 03 Resonance - The Gentle Observatory',
  eko: 'Focal · 04 Echo - The Gentle Observatory',
  prism: 'Focal · 05 Prism - The Gentle Observatory',
  knot: 'Focal · 06 Knot - The Gentle Observatory',
  circuit: 'Focal · 07 Circuit - The Gentle Observatory',
  spectrum: 'Focal · 08 Spectrum - The Gentle Observatory'
};

// --- GENTLE COPY -----------------------------------------------------------
const GENTLE_EXACT = new Map([
  ['contact detected', 'weights are touching'],
  ['completed', 'in tune ✦'],
  ['balancing', 'settling…'],
  ['status', 'harmony'],
  ['reset', 'start fresh'],
  ['avg error', 'avg drift'],
  ['locked on center', 'resting at the center'],
  ['laser target', 'target crystals'],
  ['optical status', 'beam harmony'],
  ['emitting beam 488nm', 'streaming warm light'],
  ['reflections', 'turns'],
  ['✓ resonance locked', 'in resonance ✦'],
  ['✓ RESONANCE LOCKED', 'in resonance ✦'],
  ['crossings', 'entangled threads'],
  ['intersections', 'crossings'],
  ['topology health', 'sky stillness'],
  ['signal crossings detected', 'threads crossing softly'],
  ['SIGNAL CROSSINGS DETECTED', 'threads crossing softly'],
  ['adjustments', 'glides'],
  ['✓ zero noise locked', 'constellation clear ✦'],
  ['✓ ZERO NOISE LOCKED', 'constellation clear ✦'],
  ['terminals powered', 'lanterns glowing'],
  ['magnetic loop', 'conduit flow'],
  ['flux dispersion', 'gentle current drifting'],
  ['FLUX DISPERSION', 'gentle current drifting'],
  ['seal open leaks', 'close open conduit'],
  ['SEAL OPEN LEAKS', 'close open conduit'],
  ['commutator', 'turns'],
  ['✓ closed circuit locked', 'all lanterns lit ✦'],
  ['✓ CLOSED CIRCUIT LOCKED', 'all lanterns lit ✦'],
  ['spectral resonance', 'starlight order'],
  ['gamut coherence', 'scale harmony'],
  ['reorder wavelengths', 'arrange starlight'],
  ['REORDER WAVELENGTHS', 'arrange starlight'],
  ['transitions', 'swaps'],
  ['✓ pure harmonic spectrum', 'pure melody aligned ✦'],
  ['✓ PURE HARMONIC SPECTRUM', 'pure melody aligned ✦'],
  ['reset mirrors', 'start fresh'],
  ['reset layout', 'start fresh'],
  ['reset tiles', 'start fresh'],
  ['reset rack', 'start fresh'],
  ['drag rings to untangle all crossing lines', 'glide stars gently to untangle the threads'],
  ['click mirror to deflect beam 90°', 'tap mirror to guide the beam 90°'],
  ['rotate tiles to power all terminals with zero leaks', 'turn conduits to light every lamp without open leaks'],
  ['tap two tubes to swap • audition pure ascending scale', 'tap two vials to swap · listen for a rising melody'],
  ['▶ listen spectrum sequence', '▶ listen to starlight melody'],
  ['playing...', 'listening…'],
  ['!', '~']
]);

const GENTLE_PATTERNS = [
  [/^error:/i, 'drift:'],
  [/release to play echo\.{3}/i, 'let go, and listen…'],
  [/no echo \(clear path\)/i, 'only silence: open water'],
  [/Incorrect phase fixed to (.+?)\.$/, 'A gentle correction: this one belongs to $1.'],
  [/Already has 3 (.+?) - filled remaining with (.+?)\.$/, 'Already has 3 $1: the rest settle as $2.'],
  [/No 3 identical in a (row|column) - placed (.+?)\.$/, 'Three alike cannot sit side by side in a $1: placed $2.'],
  [/Between identical phases - placed (.+?)\.$/, 'Between two alike, a different one belongs: placed $1.'],
  [/Revealed (.+?)\.$/, 'A little light on this one: $1.']
];

function softenString(text) {
  if (!text) return text;
  const trimmed = text.trim();
  if (GENTLE_EXACT.has(trimmed)) {
    return text.replace(trimmed, GENTLE_EXACT.get(trimmed));
  }
  let out = text;
  for (const [pattern, replacement] of GENTLE_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function softenTextNode(node) {
  const next = softenString(node.nodeValue);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function softenTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    softenTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    softenTextNode(current);
    current = walker.nextNode();
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning, Observer';
  if (hour >= 12 && hour < 18) return 'Good afternoon, Observer';
  if (hour >= 18 && hour < 22) return 'Good evening, Observer';
  return 'Still awake, Observer?';
}

export class ObservatoryApp {
  constructor() {
    this.currentView = 'hub';
    this.activeGameKey = 'denge';
    this.playMode = 'daily';
    this.currentEndlessSeed = null;
    this.recentEndlessSeeds = this.loadRecentEndlessSeeds();
    this.dailyDate = getTodayDateString();
    this.issueNumber = getDailyIssueNumber();
    this.solvedToday = this.loadDailyProgress();
    this.lastWinSummary = null;

    this.hubViewEl = document.getElementById('hub-view');
    this.gameViewEl = document.getElementById('game-view');
    this.stageEl = document.getElementById('game-stage');

    this.games = {
      denge: new DengeGame(this.stageEl, (summary) => this.handleGameWin('denge', summary)),
      sonar: new SonarGame(this.stageEl, (summary) => this.handleGameWin('sonar', summary)),
      resonance: new ResonanceGame(this.stageEl, (summary) => this.handleGameWin('resonance', summary)),
      eko: new EkoGame(this.stageEl, (summary) => this.handleGameWin('eko', summary)),
      prism: new PrismGame(this.stageEl, (summary) => this.handleGameWin('prism', summary)),
      knot: new KnotGame(this.stageEl, (summary) => this.handleGameWin('knot', summary)),
      circuit: new CircuitGame(this.stageEl, (summary) => this.handleGameWin('circuit', summary)),
      spectrum: new SpectrumGame(this.stageEl, (summary) => this.handleGameWin('spectrum', summary))
    };

    this.buildLanterns();
    this.bindGentleCopy();
    this.bindUI();
    this.bindLightRipples();
    this.bindRouter();
    this.updateClockAndProgressUI();
    setInterval(() => this.updateClockAndProgressUI(), 30000);

    const greetingEl = document.getElementById('hub-greeting');
    if (greetingEl) greetingEl.textContent = getGreeting();

    this.handleRoute(false);
  }

  // --- GENTLE COPY: soften every phrase the shared puzzle modules render ---
  bindGentleCopy() {
    if (!this.stageEl) return;
    this.copyObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          softenTextNode(record.target);
        } else {
          record.addedNodes.forEach((node) => softenTree(node));
        }
      }
    });
    this.copyObserver.observe(this.stageEl, { childList: true, subtree: true, characterData: true });
  }

  // --- SENSORY: Interactive Light Ripple Feedback ---
  bindLightRipples() {
    window.addEventListener('pointerdown', (e) => {
      // A soft glowing ring that expands and dissipates, like a lantern flickering on
      const ripple = document.createElement('div');
      ripple.className = 'light-ripple';
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);

      setTimeout(() => ripple.remove(), 950);
    });

    // Gentle hover chime on cards
    document.querySelectorAll('.instrument-card').forEach((card, index) => {
      card.addEventListener('mouseenter', () => {
        const chord = [392.00, 440.00, 523.25, 587.33];
        sound.playAmbientChime?.(chord[index % chord.length]);
      });
    });
  }

  buildLanterns() {
    const row = document.getElementById('lantern-row');
    if (!row) return;
    row.innerHTML = GAME_KEYS.map((key) => `<span class="lantern" data-lantern="${key}"></span>`).join('');
  }

  loadRecentEndlessSeeds() {
    try {
      const raw = sessionStorage.getItem('focal_recent_vault_seeds');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveRecentEndlessSeed(seed) {
    if (!seed) return;
    this.recentEndlessSeeds = [seed, ...this.recentEndlessSeeds.filter(s => s !== seed)].slice(0, 50);
    try {
      sessionStorage.setItem('focal_recent_vault_seeds', JSON.stringify(this.recentEndlessSeeds));
    } catch {
      // ignore
    }
  }

  getDailySeed() {
    return `DAY-${this.issueNumber}`;
  }

  getActiveSeed() {
    if (this.playMode === 'endless') {
      if (!this.currentEndlessSeed) {
        this.currentEndlessSeed = getRandomArchiveSeed(this.recentEndlessSeeds);
        this.saveRecentEndlessSeed(this.currentEndlessSeed);
      }
      return this.currentEndlessSeed;
    }
    return this.getDailySeed();
  }

  setPlayMode(mode, playAudio = true) {
    if (this.playMode === mode && this.currentEndlessSeed) return;
    if (playAudio) sound.playClick(480, 0.05, 'triangle', 0.08);
    this.playMode = mode;

    if (this.playMode === 'endless' && !this.currentEndlessSeed) {
      this.currentEndlessSeed = getRandomArchiveSeed(this.recentEndlessSeeds);
      this.saveRecentEndlessSeed(this.currentEndlessSeed);
    }

    if (this.currentView === 'game') {
      this.games[this.activeGameKey].loadSeed(this.getActiveSeed());
      if (this.activeGameKey === 'eko') {
        setTimeout(() => this.games.eko.playCurrentTargetEcho(), 280);
      }
    }

    this.updateClockAndProgressUI();
  }

  nextRandomEndlessPuzzle() {
    sound.playClick(540, 0.05, 'triangle', 0.08);
    this.playMode = 'endless';
    this.currentEndlessSeed = getRandomArchiveSeed(this.recentEndlessSeeds);
    this.saveRecentEndlessSeed(this.currentEndlessSeed);

    if (this.currentView === 'game') {
      this.games[this.activeGameKey].loadSeed(this.currentEndlessSeed);
      if (this.activeGameKey === 'eko') {
        setTimeout(() => this.games.eko.playCurrentTargetEcho(), 280);
      }
    }
    this.updateClockAndProgressUI();
  }

  loadDailyProgress() {
    try {
      const raw = localStorage.getItem(`focal_solved_${this.dailyDate}`) || localStorage.getItem(`odak_solved_${this.dailyDate}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  saveDailyProgress() {
    try {
      localStorage.setItem(`focal_solved_${this.dailyDate}`, JSON.stringify([...this.solvedToday]));
    } catch {
      // ignore
    }
  }

  bindRouter() {
    window.addEventListener('hashchange', () => {
      this.handleRoute(true);
    });
  }

  navigateTo(hash) {
    if (window.location.hash === hash) {
      this.handleRoute(true);
    } else {
      window.location.hash = hash;
    }
  }

  handleRoute(playAudio = true) {
    const rawHash = (window.location.hash || '').toLowerCase().replace(/\/$/, '');
    const target = ROUTE_ALIASES[rawHash] || 'hub';

    if (target === 'hub') {
      this.renderHubView(playAudio);
    } else {
      this.renderGameView(target, playAudio);
    }
  }

  renderHubView(playAudio = true) {
    if (playAudio) sound.playClick(440, 0.06, 'triangle', 0.07);
    if (this.activeGameKey && this.games[this.activeGameKey]?.destroy) {
      this.games[this.activeGameKey].destroy();
    }
    this.currentView = 'hub';
    document.title = PAGE_TITLES.hub;
    this.hubViewEl?.classList.remove('hidden');
    this.gameViewEl?.classList.add('hidden');
    document.querySelectorAll('.nav-mod-btn').forEach(btn => btn.classList.remove('active'));
    this.updateClockAndProgressUI();
  }

  renderGameView(gameKey, playAudio = true) {
    if (playAudio) sound.playClick(520, 0.06, 'triangle', 0.08);
    if (this.activeGameKey && this.games[this.activeGameKey]?.destroy) {
      this.games[this.activeGameKey].destroy();
    }

    const nowDate = getTodayDateString();
    if (nowDate !== this.dailyDate) {
      this.dailyDate = nowDate;
      this.issueNumber = getDailyIssueNumber();
      this.solvedToday = this.loadDailyProgress();
    }

    this.activeGameKey = gameKey;
    this.currentView = 'game';
    document.title = PAGE_TITLES[gameKey] || PAGE_TITLES.hub;
    this.hubViewEl?.classList.add('hidden');
    this.gameViewEl?.classList.remove('hidden');

    document.querySelectorAll('.nav-mod-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.game === gameKey);
    });

    // Update the in-stage poetic note
    const loreData = OBSERVATORY_LORE[gameKey];
    const loreEl = document.getElementById('stage-lore-banner');
    if (loreEl && loreData) {
      loreEl.innerHTML = `
        <div class="lore-left">
          <span class="lore-lamp"></span>
          <div>
            <div class="lore-text">${loreData.lore}</div>
            <div class="lore-coords">${loreData.station} · ${loreData.coords}</div>
          </div>
        </div>
      `;
    }

    this.updateClockAndProgressUI();
    this.games[this.activeGameKey].loadSeed(this.getActiveSeed());

    if (gameKey === 'eko') {
      setTimeout(() => this.games.eko.playCurrentTargetEcho(), 280);
    }
  }

  bindUI() {
    document.getElementById('nav-brand')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.navigateTo('#hub');
    });

    document.getElementById('btn-back-hub')?.addEventListener('click', () => {
      this.navigateTo('#hub');
    });

    document.querySelectorAll('.nav-mod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hash = GAME_TO_HASH[btn.dataset.game];
        if (hash) this.navigateTo(hash);
      });
    });

    document.querySelectorAll('[data-open-game]').forEach(card => {
      const open = () => {
        const hash = GAME_TO_HASH[card.dataset.openGame];
        if (hash) this.navigateTo(hash);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    // Mode toggles
    document.querySelectorAll('#hub-mode-daily, #game-mode-daily').forEach(btn => {
      btn.addEventListener('click', () => this.setPlayMode('daily'));
    });
    document.querySelectorAll('#hub-mode-endless, #game-mode-endless').forEach(btn => {
      btn.addEventListener('click', () => this.setPlayMode('endless'));
    });

    // Random seed button
    document.getElementById('btn-random-seed')?.addEventListener('click', () => {
      this.nextRandomEndlessPuzzle();
    });

    // Sound toggle & Ambient Music Control
    const soundBtn = document.getElementById('btn-sound-toggle');
    const ambientPill = document.getElementById('ambient-control-pill');
    const ambientBtn = document.getElementById('btn-ambient-toggle');
    const ambientSlider = document.getElementById('ambient-volume-slider');
    const ambientLabel = document.getElementById('ambient-volume-label');
    const ambientMuteBtn = document.getElementById('btn-ambient-mute');

    const paintAmbientUI = () => {
      const isPlaying = ambient.enabled && sound.enabled && ambient.volume > 0;
      const pct = Math.round(ambient.volume * 100);
      if (ambientPill) {
        ambientPill.classList.toggle('is-playing', isPlaying);
      }
      if (ambientBtn) {
        ambientBtn.setAttribute('aria-pressed', String(ambient.enabled));
        ambientBtn.title = isPlaying
          ? `Ambient music box (${pct}%) - click to adjust`
          : 'Ambient music box - click to turn on';
      }
      if (ambientSlider) {
        ambientSlider.value = String(ambient.enabled ? pct : 0);
      }
      if (ambientLabel) {
        ambientLabel.textContent = ambient.enabled && pct > 0 ? `${pct}%` : 'off';
      }
      if (ambientMuteBtn) {
        const isOn = ambient.enabled && pct > 0;
        ambientMuteBtn.textContent = isOn ? 'on' : 'off';
        ambientMuteBtn.classList.toggle('is-muted', !isOn);
        ambientMuteBtn.title = isOn ? 'Mute ambience' : 'Turn on ambience';
      }
    };

    soundBtn?.addEventListener('click', () => {
      const enabled = sound.toggle();
      soundBtn.style.opacity = enabled ? '1' : '0.35';
      ambient.sync(); // the quiet ambient bed always follows the main sound switch
      paintAmbientUI();
    });

    paintAmbientUI();

    // Clicking the ambient button opens/closes the slider popover
    ambientBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !ambientPill?.classList.contains('popover-open');
      ambientPill?.classList.toggle('popover-open', willOpen);
      ambientBtn.setAttribute('aria-expanded', String(willOpen));

      // If opening and sound is not currently on, start it up automatically at default volume
      if (willOpen && (!ambient.enabled || ambient.volume <= 0)) {
        if (ambient.volume <= 0) ambient.volume = 0.33;
        ambient.enabled = true;
        if (!sound.enabled) {
          sound.enabled = true;
          if (soundBtn) soundBtn.style.opacity = '1';
        }
        ambient.saveState();
        ambient.sync();
        paintAmbientUI();
        sound.playClick(520, 0.05, 'triangle', 0.08);
      }
    });

    // Mute/Unmute quick toggle button inside popover
    ambientMuteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      ambient.toggle();
      paintAmbientUI();
      if (ambient.enabled) sound.playClick(520, 0.05, 'triangle', 0.08);
    });

    // Close popover when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (ambientPill && !ambientPill.contains(e.target)) {
        ambientPill.classList.remove('popover-open');
        ambientBtn?.setAttribute('aria-expanded', 'false');
      }
    });

    // Close popover on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ambientPill?.classList.contains('popover-open')) {
        ambientPill.classList.remove('popover-open');
        ambientBtn?.setAttribute('aria-expanded', 'false');
      }
    });

    ambientSlider?.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      if (!sound.enabled && pct > 0) {
        sound.enabled = true;
        if (soundBtn) soundBtn.style.opacity = '1';
      }
      ambient.setVolume(pct / 100);
      paintAmbientUI();
    });

    // Observer's guide modal
    const howToModal = document.getElementById('howto-modal');
    document.getElementById('btn-howto')?.addEventListener('click', () => {
      sound.playClick(440, 0.05, 'triangle', 0.08);
      this.openHowToModal();
    });
    document.getElementById('close-howto-btn')?.addEventListener('click', () => {
      howToModal.classList.add('hidden');
    });
    howToModal?.addEventListener('click', (e) => {
      if (e.target === howToModal) howToModal.classList.add('hidden');
    });

    // Win modal
    const winModal = document.getElementById('win-modal');
    document.getElementById('close-win-btn')?.addEventListener('click', () => {
      winModal.classList.add('hidden');
    });
    winModal?.addEventListener('click', (e) => {
      if (e.target === winModal) winModal.classList.add('hidden');
    });

    document.getElementById('btn-copy-share')?.addEventListener('click', () => {
      if (!this.lastWinSummary) return;
      navigator.clipboard.writeText(`${this.lastWinSummary.shareText}\n- the gentle observatory`).then(() => {
        const btn = document.getElementById('btn-copy-share');
        btn.textContent = 'note copied ✓';
        setTimeout(() => { btn.textContent = 'share this note'; }, 2000);
      });
    });

    document.getElementById('btn-win-next')?.addEventListener('click', () => {
      winModal.classList.add('hidden');
      if (this.playMode === 'endless') {
        this.nextRandomEndlessPuzzle();
      } else {
        this.setPlayMode('endless');
      }
    });

    document.getElementById('btn-win-hub')?.addEventListener('click', () => {
      winModal.classList.add('hidden');
      this.navigateTo('#hub');
    });
  }

  updateClockAndProgressUI() {
    const isEndless = this.playMode === 'endless';

    document.querySelectorAll('#hub-mode-daily, #game-mode-daily').forEach(btn => {
      btn.classList.toggle('active', !isEndless);
    });
    document.querySelectorAll('#hub-mode-endless, #game-mode-endless').forEach(btn => {
      btn.classList.toggle('active', isEndless);
    });

    const randomBtn = document.getElementById('btn-random-seed');
    if (randomBtn) {
      randomBtn.classList.toggle('hidden', !isEndless);
    }

    const seedBadge = document.getElementById('current-seed-badge');
    if (seedBadge) {
      const activeSeed = this.getActiveSeed();
      seedBadge.textContent = formatSeedLabel(activeSeed);
      seedBadge.classList.toggle('is-vault', isEndless);
    }

    // Hub texts
    const headline = document.getElementById('hub-headline-text');
    const subline = document.getElementById('hub-subline-text');
    const progressText = document.getElementById('daily-progress-text');
    const lanternRow = document.getElementById('lantern-row');

    if (headline) {
      headline.innerHTML = isEndless
        ? 'The archive of <em>old skies</em>.'
        : 'Eight small instruments, <em>tuned gently</em> each day.';
    }
    if (subline) {
      subline.textContent = isEndless
        ? 'Every sky ever recorded is kept here. Wander through them at your own pace: no lanterns to light, nothing to keep.'
        : 'Every midnight the world changes: the wind, the light, the currents and the constellations settle into a new pattern. Sit by the window and tune the day\'s eight instruments.';
    }
    if (progressText) {
      const count = this.solvedToday.size;
      progressText.textContent = isEndless
        ? 'the archive · wander freely'
        : count === 8
          ? 'all eight instruments in tune ✦ a peaceful day'
          : `${count} / 8 instruments in tune`;
    }
    if (lanternRow) {
      lanternRow.style.display = isEndless ? 'none' : '';
      GAME_KEYS.forEach(key => {
        lanternRow.querySelector(`[data-lantern="${key}"]`)?.classList.toggle('lit', this.solvedToday.has(key));
      });
    }

    // Header clock pill
    const issueEl = document.getElementById('daily-issue-text');
    const countdownEl = document.getElementById('daily-countdown-text');
    if (issueEl) issueEl.textContent = `day #${this.issueNumber}`;
    if (countdownEl) countdownEl.textContent = `new sky in ${getMidnightCountdown()}`;

    // Completion dots & card badges
    GAME_KEYS.forEach(key => {
      const isDone = this.solvedToday.has(key);
      const dot = document.querySelector(`[data-solved-dot="${key}"]`);
      const cardStatus = document.querySelector(`[data-card-status="${key}"]`);
      if (dot) dot.classList.toggle('active', isDone);
      if (cardStatus) {
        if (isEndless) {
          cardStatus.textContent = 'wander freely →';
          cardStatus.classList.remove('is-solved');
        } else {
          cardStatus.textContent = isDone ? 'in tune ✦' : 'ready to tune';
          cardStatus.classList.toggle('is-solved', isDone);
        }
      }
    });
  }

  openHowToModal() {
    const lore = OBSERVATORY_LORE[this.activeGameKey];
    const info = lore?.howTo;
    const body = document.getElementById('howto-modal-body');
    if (!info || !body) return;

    body.innerHTML = `
      <div class="modal-header-block">
        <span class="guide-kicker">${lore.station}</span>
        <h2 style="margin-top:6px;">${info.title}</h2>
        <p class="guide-sub">"${info.subtitle}"</p>
      </div>
      <div class="howto-steps">
        ${info.steps.map(s => `
          <div class="howto-step-card">
            <div class="howto-step-icon">${s.icon}</div>
            <div class="howto-step-text">
              <h4>${s.heading}</h4>
              <p>${s.text}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('howto-modal')?.classList.remove('hidden');
  }

  handleGameWin(gameKey, summary) {
    if (this.playMode === 'daily') {
      this.solvedToday.add(gameKey);
      this.saveDailyProgress();
    }
    this.updateClockAndProgressUI();
    this.lastWinSummary = summary;

    const isEndless = this.playMode === 'endless';
    const winBody = document.getElementById('win-modal-body');
    if (winBody) {
      const cols = summary.gridCols || 5;
      const cellsHtml = (summary.visualCells || []).map(c => {
        const cls = typeof c === 'string' ? c : (c?.type || 'empty');
        const lbl = typeof c === 'object' && c?.label ? c.label : (cls === 'pivot' ? '◎' : '');
        return `<span class="win-vcell ${cls}">${lbl}</span>`;
      }).join('');

      const modulesHtml = GAME_KEYS.map(k => {
        const done = this.solvedToday.has(k);
        const isCurrent = k === gameKey;
        return `
          <button class="win-mod-pill ${done ? 'done' : ''} ${isCurrent ? 'current' : ''}" data-win-jump="${k}">
            <span class="win-mod-dot"></span>
            <span>${MODULE_NAMES[k]}</span>
          </button>
        `;
      }).join('');

      const statLabel = (label, fallback) => softenString(label || fallback);
      const gameName = (summary.gameName || MODULE_NAMES[gameKey]).toLowerCase();

      winBody.innerHTML = `
        <div class="win-meta-row">
          <span class="win-pill-soft">${formatSeedLabel(summary.seed)}</span>
          <span class="win-pill-soft">${isEndless ? 'a pleasant wander ✦' : 'in tune ✦'}</span>
        </div>

        <div class="win-hero-block" style="margin-bottom:18px;">
          <h2 class="win-lead">The ${gameName} has found its harmony</h2>
          <p class="win-note">Beautifully tuned. The room feels a little warmer now.</p>
        </div>

        <div class="win-stats-strip">
          <div class="win-stat-box">
            <span class="win-stat-lbl">${statLabel(summary.stat1Label, 'time')}</span>
            <strong class="win-stat-val">${summary.stat1Value || '-'}</strong>
          </div>
          <div class="win-stat-box">
            <span class="win-stat-lbl">${statLabel(summary.stat2Label, 'moves')}</span>
            <strong class="win-stat-val">${summary.stat2Value ?? '0'}</strong>
          </div>
          <div class="win-stat-box">
            <span class="win-stat-lbl">${statLabel(summary.stat3Label, 'hints')}</span>
            <strong class="win-stat-val highlight">${summary.stat3Value ?? '0'}</strong>
          </div>
        </div>

        <div class="win-matrix-showcase" style="margin:20px 0;">
          <div class="win-visual-matrix" style="grid-template-columns: repeat(${cols}, 1fr);">
            ${cellsHtml}
          </div>
        </div>

        <div class="win-daily-progress-block">
          <div class="win-progress-head">
            <span>${isEndless ? 'from the archive' : 'today\'s instruments'}</span>
            <strong>${isEndless ? '∞' : `${this.solvedToday.size} / 4 in tune`}</strong>
          </div>
          <div class="win-mod-pills-row">
            ${modulesHtml}
          </div>
        </div>
      `;

      winBody.querySelectorAll('[data-win-jump]').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetKey = btn.dataset.winJump;
          document.getElementById('win-modal')?.classList.add('hidden');
          const hash = GAME_TO_HASH[targetKey];
          if (hash) this.navigateTo(hash);
        });
      });
    }

    const nextBtn = document.getElementById('btn-win-next');
    if (nextBtn) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = isEndless ? 'another sky →' : 'wander the archive →';
    }

    document.getElementById('win-modal')?.classList.remove('hidden');
  }
}

// Paint the clock-driven sky before the app renders so the first frame is already correct.
if (typeof window !== 'undefined') {
  atmosphere.start();

  window.addEventListener('DOMContentLoaded', () => {
    new ObservatoryApp();
  });
}
