// Main Controller for FOCAL - 8 Serverless Daily Games
// 01 Balance, 02 Sonar, 03 Resonance, 04 Echo, 05 Prism, 06 Knot, 07 Circuit, 08 Spectrum

import { getTodayDateString, getDailyIssueNumber, getMidnightCountdown, getRandomArchiveSeed, formatSeedLabel } from './rng.js';
import { sound } from './audio.js';
import { DengeGame } from './game-denge.js';
import { SonarGame } from './game-sonar.js';
import { ResonanceGame } from './game-resonance.js';
import { EkoGame } from './game-eko.js';
import { PrismGame } from './game-prism.js';
import { KnotGame } from './game-knot.js';
import { CircuitGame } from './game-circuit.js';
import { SpectrumGame } from './game-spectrum.js';

const HOW_TO_PLAY_CONTENT = {
  denge: {
    title: '01 / balance (5×5)',
    subtitle: 'zero math, pure visual center of mass',
    steps: [
      {
        icon: '01',
        heading: 'place 3 weights',
        text: 'The weight in the blue region is fixed. Place 1 weight into each of the remaining 3 colored regions (Purple, Emerald, Coral).'
      },
      {
        icon: '02',
        heading: 'no contact rule',
        text: 'Weights cannot touch each other, even diagonally. Clicking another cell in the same region moves that region\'s weight there.'
      },
      {
        icon: '03',
        heading: 'lock on center',
        text: 'Watch the spirit level live as you hover over cells, and settle the white dot directly onto the center ring.'
      }
    ]
  },
  sonar: {
    title: '02 / sonar (tactical fleet)',
    subtitle: 'battleship solitaire • 100% deductive • zero guessing',
    steps: [
      {
        icon: '01',
        heading: 'acoustic hydrophone counters',
        text: 'Telemetry headers on the top (columns) and left (rows) indicate the exact number of submarine hull segments located along that line.'
      },
      {
        icon: '02',
        heading: 'locate 6 tactical vessels',
        text: 'The fleet comprises 1 Nuclear Submarine (3 cells), 2 Patrol Boats (2 cells), and 3 Spy Buoys (1 cell): exactly 10 ship segments across the 6×6 grid.'
      },
      {
        icon: '03',
        heading: 'strict separation (no-touch)',
        text: 'Vessels never touch each other horizontally, vertically, OR diagonally. Every ship is fully isolated by water on all corners and sides.'
      }
    ]
  },
  resonance: {
    title: '03 / resonance',
    subtitle: '3 blue + 3 orange in every row and column',
    steps: [
      {
        icon: '01',
        heading: '3 blue and 3 orange',
        text: 'Each row and column must contain an equal number of crests (3 Blue ∿+) and troughs (3 Orange ∿−).'
      },
      {
        icon: '02',
        heading: 'no trios rule',
        text: 'No more than two identical phases may appear adjacent horizontally or vertically (never 3 in a row).'
      },
      {
        icon: '03',
        heading: 'connectors (= and ×)',
        text: 'An "=" between cells means both share the same phase; "×" means they must have opposite phases.'
      }
    ]
  },
  eko: {
    title: '04 / echo',
    subtitle: 'auditory memory • hold to synthesize your echo',
    steps: [
      {
        icon: '01',
        heading: 'listen and memorize target echo',
        text: 'Click "Listen to Target Echo" and carefully memorize the time delay between the initial ping and the returning reflection.'
      },
      {
        icon: '02',
        heading: 'press & hold, then release',
        text: 'Hold down the central pad (or Spacebar) for that exact duration and release. Your synthesized echo plays back immediately!'
      },
      {
        icon: '03',
        heading: 'compare by ear and lock in',
        text: 'Compare your echo with the target. Once you are confident they match, click "Locked In, Submit".'
      }
    ]
  },
  prism: {
    title: '05 / prism (optical routing)',
    subtitle: '5×5 photonics • rotate mirrors to illuminate target sensors',
    steps: [
      {
        icon: '01',
        heading: 'laser emitter & sensors',
        text: 'The laser emitter continuously casts a monochromatic beam into the 5×5 laboratory chamber. Guide the beam so it activates all target sensors.'
      },
      {
        icon: '02',
        heading: 'rotate 45° mirrors',
        text: 'Click on any mirror to rotate it 90° clockwise. Mirrors deflect the laser beam precisely 90° across the grid.'
      },
      {
        icon: '03',
        heading: 'avoid obstacles & loops',
        text: 'Obstacles absorb the beam completely. Arrange your mirror angles so the beam travels freely from the emitter through all sensors.'
      }
    ]
  },
  knot: {
    title: '06 / knot (topological untangle)',
    subtitle: 'planar graph • drag nodes to eliminate all crossings',
    steps: [
      {
        icon: '01',
        heading: 'elastic signal lines',
        text: 'Each node transmits signals along connected lines. Whenever two lines cross, a red interference point appears.'
      },
      {
        icon: '02',
        heading: 'drag nodes to untangle',
        text: 'Click and drag (or touch and drag) any node across the screen to untangle overlapping edges.'
      },
      {
        icon: '03',
        heading: 'achieve 0 crossings',
        text: 'When all line intersections reach zero, parazitic noise cuts off and the topology locks in a harmonious chord.'
      }
    ]
  },
  circuit: {
    title: '07 / circuit (magnetic flux)',
    subtitle: '4×4 closed loop • rotate flux conduits to power all relays',
    steps: [
      {
        icon: '01',
        heading: 'main power generator',
        text: 'Energy originates at the central generator core and flows through connected conduits.'
      },
      {
        icon: '02',
        heading: 'rotate conduit tiles',
        text: 'Click any tile to rotate its magnetic pathways 90°. When opposite ports align, energy flows seamlessly between them.'
      },
      {
        icon: '03',
        heading: 'seal all leaks',
        text: 'Power all target terminal relays without leaving open leaking ends pointing into walls or unmatched neighbors.'
      }
    ]
  },
  spectrum: {
    title: '08 / spectrum (harmonic gamut)',
    subtitle: '400-750 THz • order optical tubes into a pure musical scale',
    steps: [
      {
        icon: '01',
        heading: 'fixed optical bounds',
        text: 'The leftmost tube (Violet / 400 THz / C4) and rightmost tube (Ruby / 750 THz / C5) are locked anchors.'
      },
      {
        icon: '02',
        heading: 'swap intermediate tubes',
        text: 'Click any tube to hear its pure frequency. Click a second tube to swap their positions.'
      },
      {
        icon: '03',
        heading: 'audition ascending scale',
        text: 'Click "Listen Spectrum Sequence" to play the rack left-to-right. Align the tubes into a smooth color gradient and ascending melody.'
      }
    ]
  }
};

const ROUTE_ALIASES = {
  '': 'hub',
  '#': 'hub',
  '#hub': 'hub',
  '#balance': 'denge',
  '#denge': 'denge',
  '#sonar': 'sonar',
  '#resonance': 'resonance',
  '#rezonans': 'resonance',
  '#echo': 'eko',
  '#eko': 'eko',
  '#prism': 'prism',
  '#prizma': 'prism',
  '#optics': 'prism',
  '#knot': 'knot',
  '#dugum': 'knot',
  '#untangle': 'knot',
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
  hub: 'FOCAL - Daily Perception & Logic Laboratory',
  denge: 'FOCAL - 01 Balance',
  sonar: 'FOCAL - 02 Sonar',
  resonance: 'FOCAL - 03 Resonance',
  eko: 'FOCAL - 04 Echo',
  prism: 'FOCAL - 05 Prism',
  knot: 'FOCAL - 06 Knot',
  circuit: 'FOCAL - 07 Circuit',
  spectrum: 'FOCAL - 08 Spectrum'
};

class FocalDailyApp {
  constructor() {
    this.currentView = 'hub';
    this.activeGameKey = 'denge';
    this.playMode = 'daily'; // 'daily' | 'endless'
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

    this.bindUI();
    this.bindRouter();
    this.updateClockAndProgressUI();
    setInterval(() => this.updateClockAndProgressUI(), 30000);

    // Initial route check on page load
    this.handleRoute(false);
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
    if (playAudio) sound.playClick(500);
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
    sound.playClick(580);
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
      // ignore storage errors
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
    if (playAudio) sound.playClick(460);
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
    if (playAudio) sound.playClick(540);
    if (this.activeGameKey && this.games[this.activeGameKey]?.destroy) {
      this.games[this.activeGameKey].destroy();
    }

    // Check if date rolled over past midnight
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

    this.updateClockAndProgressUI();
    this.games[this.activeGameKey].loadSeed(this.getActiveSeed());

    // If opening Eko, play first round echo after a brief delay
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
      card.addEventListener('click', () => {
        const hash = GAME_TO_HASH[card.dataset.openGame];
        if (hash) this.navigateTo(hash);
      });
    });

    // Mode toggles
    document.querySelectorAll('#hub-mode-daily, #game-mode-daily').forEach(btn => {
      btn.addEventListener('click', () => this.setPlayMode('daily'));
    });
    document.querySelectorAll('#hub-mode-endless, #game-mode-endless').forEach(btn => {
      btn.addEventListener('click', () => this.setPlayMode('endless'));
    });

    // Random seed button in game stage
    document.getElementById('btn-random-seed')?.addEventListener('click', () => {
      this.nextRandomEndlessPuzzle();
    });

    // Sound Toggle
    const soundBtn = document.getElementById('btn-sound-toggle');
    soundBtn?.addEventListener('click', () => {
      const enabled = sound.toggle();
      soundBtn.style.opacity = enabled ? '1' : '0.35';
    });

    // How To Play Modal
    const howToModal = document.getElementById('howto-modal');
    document.getElementById('btn-howto')?.addEventListener('click', () => {
      sound.playClick(480);
      this.openHowToModal();
    });
    document.getElementById('close-howto-btn')?.addEventListener('click', () => {
      howToModal.classList.add('hidden');
    });
    howToModal?.addEventListener('click', (e) => {
      if (e.target === howToModal) howToModal.classList.add('hidden');
    });

    // Win Modal
    const winModal = document.getElementById('win-modal');
    document.getElementById('close-win-btn')?.addEventListener('click', () => {
      winModal.classList.add('hidden');
    });
    winModal?.addEventListener('click', (e) => {
      if (e.target === winModal) winModal.classList.add('hidden');
    });

    document.getElementById('btn-copy-share')?.addEventListener('click', () => {
      if (!this.lastWinSummary) return;
      navigator.clipboard.writeText(this.lastWinSummary.shareText).then(() => {
        const btn = document.getElementById('btn-copy-share');
        btn.textContent = 'copied ✓';
        setTimeout(() => { btn.textContent = 'copy score'; }, 2000);
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

    // Update Mode Toggles in Hub & Game view
    document.querySelectorAll('#hub-mode-daily, #game-mode-daily').forEach(btn => {
      btn.classList.toggle('active', !isEndless);
    });
    document.querySelectorAll('#hub-mode-endless, #game-mode-endless').forEach(btn => {
      btn.classList.toggle('active', isEndless);
    });

    // Random Seed Button in Game View
    const randomBtn = document.getElementById('btn-random-seed');
    if (randomBtn) {
      randomBtn.classList.toggle('hidden', !isEndless);
    }

    // Seed badge in game view
    const seedBadge = document.getElementById('current-seed-badge');
    if (seedBadge) {
      const activeSeed = this.getActiveSeed();
      seedBadge.textContent = formatSeedLabel(activeSeed);
      seedBadge.classList.toggle('is-vault', isEndless);
      seedBadge.title = isEndless ? 'Archive Seed (Pre-2026 Vault)' : 'Daily Station Seed';
    }

    // Hub view texts
    const headline = document.getElementById('hub-headline-text');
    const subline = document.getElementById('hub-subline-text');
    const progressEl = document.getElementById('daily-progress-pill');

    if (headline) {
      headline.textContent = isEndless
        ? 'endless archive & practice vault.'
        : 'daily mental & perceptual instruments.';
    }
    if (subline) {
      subline.textContent = isEndless
        ? '20,454 historical perception puzzles (1970-2025). Replay endlessly without limits.'
        : 'Eight distinct spatial, acoustic, optical, and topological instruments. Refreshes every midnight.';
    }
    if (progressEl) {
      progressEl.textContent = isEndless
        ? 'infinite vault • 20,454 seeds'
        : `${this.solvedToday.size} / 8 completed`;
    }

    // Header Clock Pill
    const issueEl = document.getElementById('daily-issue-text');
    const countdownEl = document.getElementById('daily-countdown-text');
    if (issueEl) issueEl.textContent = `day #${this.issueNumber}`;
    if (countdownEl) countdownEl.textContent = `next in ${getMidnightCountdown()}`;

    // Update completion dots & card badges
    ['denge', 'sonar', 'resonance', 'eko', 'prism', 'knot', 'circuit', 'spectrum'].forEach(key => {
      const isDone = this.solvedToday.has(key);
      const dot = document.querySelector(`[data-solved-dot="${key}"]`);
      const cardStatus = document.querySelector(`[data-card-status="${key}"]`);
      if (dot) dot.classList.toggle('done', isDone);
      if (cardStatus) {
        if (isEndless) {
          cardStatus.textContent = 'infinite play →';
          cardStatus.classList.remove('completed');
        } else {
          cardStatus.textContent = isDone ? 'completed ✓' : 'daily ready';
          cardStatus.classList.toggle('completed', isDone);
        }
      }
    });
  }

  openHowToModal() {
    const info = HOW_TO_PLAY_CONTENT[this.activeGameKey];
    const body = document.getElementById('howto-modal-body');
    if (!info || !body) return;

    body.innerHTML = `
      <div class="modal-header-block">
        <h2>${info.title}</h2>
        <p class="modal-sub">${info.subtitle}</p>
      </div>
      <div class="howto-steps">
        ${info.steps.map(s => `
          <div class="howto-step-card">
            <div class="howto-step-icon" style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">${s.icon}</div>
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

    const moduleNames = {
      denge: '01 balance',
      sonar: '02 sonar',
      resonance: '03 resonance',
      eko: '04 echo',
      prism: '05 prism',
      knot: '06 knot',
      circuit: '07 circuit',
      spectrum: '08 spectrum'
    };

    const isEndless = this.playMode === 'endless';
    const winBody = document.getElementById('win-modal-body');
    if (winBody) {
      const cols = summary.gridCols || 5;
      const cellsHtml = (summary.visualCells || []).map(c => {
        const cls = typeof c === 'string' ? c : (c?.type || 'empty');
        const lbl = typeof c === 'object' && c?.label ? c.label : (cls === 'pivot' ? '◎' : '');
        return `<span class="win-vcell ${cls}">${lbl}</span>`;
      }).join('');

      const modulesHtml = ['denge', 'sonar', 'resonance', 'eko', 'prism', 'knot', 'circuit', 'spectrum'].map(k => {
        const done = this.solvedToday.has(k);
        const isCurrent = k === gameKey;
        return `
          <button class="win-mod-pill ${done ? 'done' : ''} ${isCurrent ? 'current' : ''}" data-win-jump="${k}">
            <span class="win-mod-dot"></span>
            <span>${moduleNames[k]}</span>
          </button>
        `;
      }).join('');

      winBody.innerHTML = `
        <div class="win-sleek-top">
          <span class="win-day-pill">${formatSeedLabel(summary.seed)}</span>
          <span class="win-status-pill"><span class="status-dot"></span> ${isEndless ? 'cleared ∞' : 'completed'}</span>
        </div>

        <div class="win-hero-block">
          <h2 class="win-hero-title">${summary.gameName.toLowerCase()}</h2>
          <p class="win-hero-sub">${summary.subtitle || summary.metricText}</p>
        </div>

        <div class="win-stats-strip">
          <div class="win-stat-box">
            <span class="win-stat-lbl">${summary.stat1Label || 'performance'}</span>
            <strong class="win-stat-val">${summary.stat1Value || '-'}</strong>
          </div>
          <div class="win-stat-box">
            <span class="win-stat-lbl">${summary.stat2Label || 'hints'}</span>
            <strong class="win-stat-val">${summary.stat2Value ?? '0'}</strong>
          </div>
          <div class="win-stat-box">
            <span class="win-stat-lbl">${summary.stat3Label || 'status'}</span>
            <strong class="win-stat-val highlight">${summary.stat3Value || '100%'}</strong>
          </div>
        </div>

        <div class="win-matrix-showcase">
          <div class="win-visual-matrix" style="grid-template-columns: repeat(${cols}, 1fr);">
            ${cellsHtml}
          </div>
        </div>

        <div class="win-daily-progress-block">
          <div class="win-daily-header">
            <span>${isEndless ? 'practice archives' : 'daily station progress'}</span>
            <strong>${isEndless ? '∞ vault' : `${this.solvedToday.size} / 8`}</strong>
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
      nextBtn.textContent = isEndless ? 'next random puzzle →' : 'play endless mode ∞ →';
    }

    document.getElementById('win-modal')?.classList.remove('hidden');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new FocalDailyApp();
});
