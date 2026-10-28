// Observatory Main Controller
// Narrative & sensory atmosphere for FOCAL: The Gentle Observatory.
// A calm hilltop observatory where the player (the Observer) tunes four instruments each day.

import {
  getTodayDateString,
  getDailyIssueNumber,
  getMidnightCountdown,
  getRandomArchiveSeed,
  formatSeedLabel,
} from "./rng.js";
import { observatorySound, sound, ambient } from "./observatory-audio.js";
import { atmosphere } from "./atmosphere.js";
import { ico } from "./icons.js";
import { DengeGame } from "./game-denge.js";
import { SonarGame } from "./game-sonar.js";
import { ResonanceGame } from "./game-resonance.js";
import { EkoGame } from "./game-eko.js";
import { PrismGame } from "./game-prism.js";
import { KnotGame } from "./game-knot.js";
import { CircuitGame } from "./game-circuit.js";
import { SpectrumGame } from "./game-spectrum.js";

const GAME_KEYS = [
  "denge",
  "sonar",
  "resonance",
  "eko",
  "prism",
  "knot",
  "circuit",
  "spectrum",
];

// Puzzles solved by ear: the ambient music box steps aside while they are open
const LISTENING_GAMES = ["eko", "spectrum"];

const OBSERVATORY_LORE = {
  denge: {
    role: "the swaying tower",
    lore: "Steady the lighthouse against the coastal wind by settling the counterweights until the tower stops swaying.",
    howTo: {
      title: "01 · Balance",
      subtitle:
        "No math at all: feel where the counterweights want to rest around the central pivot.",
      steps: [
        {
          icon: "01",
          heading: "One weight per inlay",
          text: "The sea-glass weight is already bolted to the board. Give each of the other three colored inlays one brass counterweight.",
        },
        {
          icon: "02",
          heading: "Keep them apart",
          text: "Counterweights never touch, not even at the corners. Tap another square of the same inlay to move its weight. Right-click crosses a square out.",
        },
        {
          icon: "03",
          heading: "Center the plumb-line",
          text: "Hover over a square to see where the bubble and plumb-line would drift. Bring the weight to rest at the central pivot.",
        },
      ],
    },
  },
  sonar: {
    role: "the quiet harbor",
    lore: "Send soft pings through the morning mist to find the quiet boats and soothe the waters beneath the harbor.",
    howTo: {
      title: "02 · Sonar",
      subtitle:
        "Six quiet boats rest somewhere in the mist. Find them with logic and two soft pings.",
      steps: [
        {
          icon: "01",
          heading: "Read the listening posts",
          text: "The numbers beside each row and column say how many boat squares that line holds. The small dots fill in as you mark boats.",
        },
        {
          icon: "02",
          heading: "Boats keep their distance",
          text: "One trawler (3 squares), two rowboats (2) and three lantern buoys (1) rest in the harbor. No two boats touch, not even at the corners. Tap a square to cycle mist, boat and water.",
        },
        {
          icon: "03",
          heading: "Send a soft ping",
          text: "Stuck? Press ping, then tap a misty square to hear what lies beneath it. You have two pings per harbor, so choose with care.",
        },
      ],
    },
  },
  resonance: {
    role: "the restless air",
    lore: "Align crests and troughs until the conflicting air currents cancel out and the atmosphere hums in stillness.",
    howTo: {
      title: "03 · Resonance",
      subtitle:
        "Three crests and three troughs in every row and column, until the golden wave settles flat.",
      steps: [
        {
          icon: "01",
          heading: "Balance every line",
          text: "Every row and column needs exactly three blue crests and three amber troughs. As each line balances, the golden wave above grows calmer.",
        },
        {
          icon: "02",
          heading: "Never three alike",
          text: "No more than two matching waves may sit side by side. A clashing tile turns rose-colored.",
        },
        {
          icon: "03",
          heading: "Follow the links",
          text: `A ${ico("same")} link between two squares means the same wave; ${ico("opposite")} means opposite waves. Tap a square to cycle, right-click to cycle back.`,
        },
      ],
    },
  },
  eko: {
    role: "the valley’s memory",
    lore: "Call into the canyon and measure the returning echo, bridging the distance between mountain and sea.",
    howTo: {
      title: "04 · Echo",
      subtitle:
        "Call across five misty ridges and hold the brass pad as long as each echo takes to return.",
      steps: [
        {
          icon: "01",
          heading: "Listen to the call",
          text: "Play the canyon echo and notice the quiet stretch between the lighthouse horn and the cliff’s answer. Keep that silence in mind.",
        },
        {
          icon: "02",
          heading: "Hold, then release",
          text: "Press and hold the pad (or the Spacebar) for as long as that silence lasted. Your echo plays the moment you let go.",
        },
        {
          icon: "03",
          heading: "Compare by ear, then seal",
          text: "Hear both once more. When they feel like the same distance across the gorge, seal your echo.",
        },
      ],
    },
  },
  prism: {
    role: "the morning sunbeam",
    lore: "Rotate the small brass mirrors to guide the morning sunbeam across the room and awaken every dormant crystal.",
    howTo: {
      title: "05 · Prism",
      subtitle:
        "Guide the sunbeam across the room and awaken every dormant crystal.",
      steps: [
        {
          icon: "01",
          heading: "The morning sunbeam",
          text: "A single warm ray streams in through the lighthouse window. Turn the brass mirrors to guide its path.",
        },
        {
          icon: "02",
          heading: "Turn the mirrors",
          text: "Tap a mirror to turn it a quarter turn. Each mirror bends the beam at a clean right angle.",
        },
        {
          icon: "03",
          heading: "Awaken every crystal",
          text: "Stone pillars block the light, and bolted mirrors cannot be turned. Weave the ray through the room until every crystal glows amber.",
        },
      ],
    },
  },
  knot: {
    role: "the star threads",
    lore: "Untangle the crossing threads of the stars and clear the haze from the night sky.",
    howTo: {
      title: "06 · Knot",
      subtitle:
        "Untangle the silken threads of the constellation until no lines cross.",
      steps: [
        {
          icon: "01",
          heading: "Threads in the haze",
          text: "Each star is tied to its neighbors by a glowing thread. Where two threads cross, they turn rose-colored and haze clouds the sky.",
        },
        {
          icon: "02",
          heading: "Glide the stars",
          text: "Drag the stars gently across the sky. They will not overlap, so guide them around each other.",
        },
        {
          icon: "03",
          heading: "A clear sky",
          text: "When no thread crosses another, the haze lifts and the constellation reveals its name.",
        },
      ],
    },
  },
  circuit: {
    role: "the brass pipes",
    lore: "Route warm current through the brass pipes to light every reading lantern before dusk.",
    howTo: {
      title: "07 · Circuit",
      subtitle:
        "Turn the brass pipes to light every lantern without letting any current leak.",
      steps: [
        {
          icon: "01",
          heading: "The dynamo",
          text: "Warm current flows outward from the station dynamo and glides through every connected pipe.",
        },
        {
          icon: "02",
          heading: "Turn the pipes",
          text: "Tap a pipe to turn it a quarter turn. When open ends meet, the current flows quietly through.",
        },
        {
          icon: "03",
          heading: "Light every lantern",
          text: "Reach every reading lantern without leaving an open end. Sparks show where current leaks. Bolted pipes cannot be turned, so build around them.",
        },
      ],
    },
  },
  spectrum: {
    role: "the seven vials",
    lore: "Arrange the seven vials of starlight in ascending pitch, and reunite color with melody.",
    howTo: {
      title: "08 · Spectrum",
      subtitle:
        "Arrange the glass vials of starlight into a smooth rising melody.",
      steps: [
        {
          icon: "01",
          heading: "Colors lie",
          text: "Each vial sings one hidden pitch. Color and name are decoys with no link to the pitch.",
        },
        {
          icon: "02",
          heading: "Swap any two vials",
          text: "Tap a vial to hear its tone, then tap a second to trade places. Neighboring pitches can be a single semitone apart.",
        },
        {
          icon: "03",
          heading: "Hear the melody",
          text: `Press ${ico("note")} hear the melody to play the rack from left to right. The lowest voice belongs on the left, the highest on the right.`,
        },
      ],
    },
  },
};

const MODULE_NAMES = {
  denge: "Balance",
  sonar: "Sonar",
  resonance: "Resonance",
  eko: "Echo",
  prism: "Prism",
  knot: "Knot",
  circuit: "Circuit",
  spectrum: "Spectrum",
};

const ROUTE_ALIASES = {
  "": "hub",
  "#": "hub",
  "#hub": "hub",
  "#balance": "denge",
  "#denge": "denge",
  "#sonar": "sonar",
  "#resonance": "resonance",
  "#echo": "eko",
  "#eko": "eko",
  "#prism": "prism",
  "#prizma": "prism",
  "#knot": "knot",
  "#dugum": "knot",
  "#circuit": "circuit",
  "#devre": "circuit",
  "#spectrum": "spectrum",
  "#spektrum": "spectrum",
};

const GAME_TO_HASH = {
  hub: "#hub",
  denge: "#balance",
  sonar: "#sonar",
  resonance: "#resonance",
  eko: "#echo",
  prism: "#prism",
  knot: "#knot",
  circuit: "#circuit",
  spectrum: "#spectrum",
};

const PAGE_TITLES = {
  hub: "Focal - The Gentle Observatory",
  denge: "Focal · 01 Balance",
  sonar: "Focal · 02 Sonar",
  resonance: "Focal · 03 Resonance",
  eko: "Focal · 04 Echo",
  prism: "Focal · 05 Prism",
  knot: "Focal · 06 Knot",
  circuit: "Focal · 07 Circuit",
  spectrum: "Focal · 08 Spectrum",
};

function instrumentLabel(gameKey) {
  const n = String(GAME_KEYS.indexOf(gameKey) + 1).padStart(2, "0");
  return `Instrument ${n} · ${OBSERVATORY_LORE[gameKey].role}`;
}

const SEALED_LOG =
  "Tower in equilibrium. Harbor waters still. All eight instruments sing as one. The world rests quiet tonight.";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning, Observer";
  if (hour >= 12 && hour < 18) return "Good afternoon, Observer";
  if (hour >= 18 && hour < 22) return "Good evening, Observer";
  return "Still awake, Observer?";
}

export class ObservatoryApp {
  constructor() {
    this.currentView = "hub";
    this.activeGameKey = "denge";
    this.playMode = "daily";
    this.currentEndlessSeed = null;
    this.recentEndlessSeeds = this.loadRecentEndlessSeeds();
    this.dailyDate = getTodayDateString();
    this.issueNumber = getDailyIssueNumber();
    this.solvedToday = this.loadDailyProgress();
    this.lastWinSummary = null;

    this.hubViewEl = document.getElementById("hub-view");
    this.gameViewEl = document.getElementById("game-view");
    this.stageEl = document.getElementById("game-stage");

    this.games = {
      denge: new DengeGame(this.stageEl, (summary) =>
        this.handleGameWin("denge", summary),
      ),
      sonar: new SonarGame(this.stageEl, (summary) =>
        this.handleGameWin("sonar", summary),
      ),
      resonance: new ResonanceGame(this.stageEl, (summary) =>
        this.handleGameWin("resonance", summary),
      ),
      eko: new EkoGame(this.stageEl, (summary) =>
        this.handleGameWin("eko", summary),
      ),
      prism: new PrismGame(this.stageEl, (summary) =>
        this.handleGameWin("prism", summary),
      ),
      knot: new KnotGame(this.stageEl, (summary) =>
        this.handleGameWin("knot", summary),
      ),
      circuit: new CircuitGame(this.stageEl, (summary) =>
        this.handleGameWin("circuit", summary),
      ),
      spectrum: new SpectrumGame(this.stageEl, (summary) =>
        this.handleGameWin("spectrum", summary),
      ),
    };

    this.buildLanterns();
    this.bindUI();
    this.bindLightRipples();
    this.bindRouter();
    this.updateClockAndProgressUI();
    setInterval(() => this.updateClockAndProgressUI(), 30000);

    const greetingEl = document.getElementById("hub-greeting");
    if (greetingEl) greetingEl.textContent = getGreeting();

    this.handleRoute(false);
  }

  // --- SENSORY: Interactive Light Ripple Feedback ---
  bindLightRipples() {
    window.addEventListener("pointerdown", (e) => {
      // A soft glowing ring that expands and dissipates, like a lantern flickering on
      const ripple = document.createElement("div");
      ripple.className = "light-ripple";
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);

      setTimeout(() => ripple.remove(), 950);
    });

    // Gentle hover chime on cards
    document.querySelectorAll(".instrument-card").forEach((card, index) => {
      card.addEventListener("mouseenter", () => {
        const chord = [392.0, 440.0, 523.25, 587.33];
        sound.playAmbientChime?.(chord[index % chord.length]);
      });
    });
  }

  buildLanterns() {
    const row = document.getElementById("lantern-row");
    if (!row) return;
    row.innerHTML = GAME_KEYS.map(
      (key) => `<span class="lantern" data-lantern="${key}"></span>`,
    ).join("");
  }

  loadRecentEndlessSeeds() {
    try {
      const raw = sessionStorage.getItem("focal_recent_vault_seeds");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveRecentEndlessSeed(seed) {
    if (!seed) return;
    this.recentEndlessSeeds = [
      seed,
      ...this.recentEndlessSeeds.filter((s) => s !== seed),
    ].slice(0, 50);
    try {
      sessionStorage.setItem(
        "focal_recent_vault_seeds",
        JSON.stringify(this.recentEndlessSeeds),
      );
    } catch {
      // ignore
    }
  }

  getDailySeed() {
    return `DAY-${this.issueNumber}`;
  }

  getActiveSeed() {
    if (this.playMode === "endless") {
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
    if (playAudio) sound.playClick(480, 0.05, "triangle", 0.08);
    this.playMode = mode;

    if (this.playMode === "endless" && !this.currentEndlessSeed) {
      this.currentEndlessSeed = getRandomArchiveSeed(this.recentEndlessSeeds);
      this.saveRecentEndlessSeed(this.currentEndlessSeed);
    }

    if (this.currentView === "game") {
      this.games[this.activeGameKey].loadSeed(this.getActiveSeed());
      if (this.activeGameKey === "eko") {
        setTimeout(() => this.games.eko.playCurrentTargetEcho(), 280);
      }
    }

    this.updateClockAndProgressUI();
  }

  nextRandomEndlessPuzzle() {
    sound.playClick(540, 0.05, "triangle", 0.08);
    this.playMode = "endless";
    this.currentEndlessSeed = getRandomArchiveSeed(this.recentEndlessSeeds);
    this.saveRecentEndlessSeed(this.currentEndlessSeed);

    if (this.currentView === "game") {
      this.games[this.activeGameKey].loadSeed(this.currentEndlessSeed);
      if (this.activeGameKey === "eko") {
        setTimeout(() => this.games.eko.playCurrentTargetEcho(), 280);
      }
    }
    this.updateClockAndProgressUI();
  }

  loadDailyProgress() {
    try {
      const raw =
        localStorage.getItem(`focal_solved_${this.dailyDate}`) ||
        localStorage.getItem(`odak_solved_${this.dailyDate}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  saveDailyProgress() {
    try {
      localStorage.setItem(
        `focal_solved_${this.dailyDate}`,
        JSON.stringify([...this.solvedToday]),
      );
    } catch {
      // ignore
    }
  }

  bindRouter() {
    window.addEventListener("hashchange", () => {
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
    const rawHash = (window.location.hash || "")
      .toLowerCase()
      .replace(/\/$/, "");
    const target = ROUTE_ALIASES[rawHash] || "hub";

    if (target === "hub") {
      this.renderHubView(playAudio);
    } else {
      this.renderGameView(target, playAudio);
    }
  }

  renderHubView(playAudio = true) {
    if (playAudio) sound.playClick(440, 0.06, "triangle", 0.07);
    if (this.activeGameKey && this.games[this.activeGameKey]?.destroy) {
      this.games[this.activeGameKey].destroy();
    }
    this.currentView = "hub";
    ambient.setDucked(false);
    document.title = PAGE_TITLES.hub;
    this.hubViewEl?.classList.remove("hidden");
    this.gameViewEl?.classList.add("hidden");
    document
      .querySelectorAll(".nav-mod-btn")
      .forEach((btn) => btn.classList.remove("active"));
    this.updateClockAndProgressUI();
  }

  renderGameView(gameKey, playAudio = true) {
    if (playAudio) sound.playClick(520, 0.06, "triangle", 0.08);
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
    this.currentView = "game";
    ambient.setDucked(LISTENING_GAMES.includes(gameKey));
    document.title = PAGE_TITLES[gameKey] || "Focal";
    const switchLabel = document.getElementById("game-switch-label");
    if (switchLabel)
      switchLabel.textContent = MODULE_NAMES[gameKey].toLowerCase();
    this.hubViewEl?.classList.add("hidden");
    this.gameViewEl?.classList.remove("hidden");

    document.querySelectorAll(".nav-mod-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.game === gameKey);
    });

    // Update the in-stage poetic note
    const loreData = OBSERVATORY_LORE[gameKey];
    const loreEl = document.getElementById("stage-lore-banner");
    if (loreEl && loreData) {
      loreEl.innerHTML = `
        <div class="lore-left">
          <span class="lore-lamp"></span>
          <div>
            <div class="lore-text">${loreData.lore}</div>
            <div class="lore-coords">${instrumentLabel(gameKey)}</div>
          </div>
        </div>
      `;
    }

    this.updateClockAndProgressUI();
    this.games[this.activeGameKey].loadSeed(this.getActiveSeed());

    if (gameKey === "eko") {
      setTimeout(() => this.games.eko.playCurrentTargetEcho(), 280);
    }
  }

  bindUI() {
    document.getElementById("nav-brand")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.navigateTo("#hub");
    });

    document.getElementById("btn-back-hub")?.addEventListener("click", () => {
      this.navigateTo("#hub");
    });

    const switchBtn = document.getElementById("btn-game-switch");
    const switchMenu = document.getElementById("game-switch-menu");
    if (switchBtn && switchMenu) {
      const setOpen = (open) => {
        switchMenu.classList.toggle("hidden", !open);
        switchBtn.setAttribute("aria-expanded", String(open));
      };
      switchMenu.innerHTML = GAME_KEYS.map(
        (k) =>
          `<button class="game-switch-item" role="menuitem" data-switch-game="${k}">${MODULE_NAMES[k]}</button>`,
      ).join("");
      switchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        switchMenu
          .querySelectorAll(".game-switch-item")
          .forEach((b) =>
            b.classList.toggle(
              "current",
              b.dataset.switchGame === this.activeGameKey,
            ),
          );
        setOpen(switchMenu.classList.contains("hidden"));
      });
      switchMenu.addEventListener("click", (e) => {
        const item = e.target.closest("[data-switch-game]");
        if (!item) return;
        setOpen(false);
        const hash = GAME_TO_HASH[item.dataset.switchGame];
        if (hash) this.navigateTo(hash);
      });
      document.addEventListener("click", () => setOpen(false));
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") setOpen(false);
      });
    }

    document.querySelectorAll(".nav-mod-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hash = GAME_TO_HASH[btn.dataset.game];
        if (hash) this.navigateTo(hash);
      });
    });

    document.querySelectorAll("[data-open-game]").forEach((card) => {
      const open = () => {
        const hash = GAME_TO_HASH[card.dataset.openGame];
        if (hash) this.navigateTo(hash);
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

    // Mode toggles
    document
      .querySelectorAll("#hub-mode-daily, #game-mode-daily")
      .forEach((btn) => {
        btn.addEventListener("click", () => this.setPlayMode("daily"));
      });
    document
      .querySelectorAll("#hub-mode-endless, #game-mode-endless")
      .forEach((btn) => {
        btn.addEventListener("click", () => this.setPlayMode("endless"));
      });

    // Random seed button
    document
      .getElementById("btn-random-seed")
      ?.addEventListener("click", () => {
        this.nextRandomEndlessPuzzle();
      });

    // Sound toggle & Ambient Music Control
    const soundBtn = document.getElementById("btn-sound-toggle");
    const ambientPill = document.getElementById("ambient-control-pill");
    const ambientBtn = document.getElementById("btn-ambient-toggle");
    const ambientSlider = document.getElementById("ambient-volume-slider");
    const ambientLabel = document.getElementById("ambient-volume-label");
    const ambientMuteBtn = document.getElementById("btn-ambient-mute");

    const paintAmbientUI = () => {
      const isPlaying = ambient.enabled && sound.enabled && ambient.volume > 0;
      const pct = Math.round(ambient.volume * 100);
      if (ambientPill) {
        ambientPill.classList.toggle("is-playing", isPlaying);
      }
      if (ambientBtn) {
        ambientBtn.setAttribute("aria-pressed", String(ambient.enabled));
        ambientBtn.title = isPlaying
          ? `Ambient music box (${pct}%) - click to adjust`
          : "Ambient music box - click to turn on";
      }
      if (ambientSlider) {
        ambientSlider.value = String(ambient.enabled ? pct : 0);
      }
      if (ambientLabel) {
        ambientLabel.textContent =
          ambient.enabled && pct > 0 ? `${pct}%` : "off";
      }
      if (ambientMuteBtn) {
        const isOn = ambient.enabled && pct > 0;
        ambientMuteBtn.textContent = isOn ? "on" : "off";
        ambientMuteBtn.classList.toggle("is-muted", !isOn);
        ambientMuteBtn.title = isOn ? "Mute ambience" : "Turn on ambience";
      }
    };

    soundBtn?.addEventListener("click", () => {
      const enabled = sound.toggle();
      soundBtn.style.opacity = enabled ? "1" : "0.35";
      ambient.sync(); // the quiet ambient bed always follows the main sound switch
      paintAmbientUI();
    });

    paintAmbientUI();

    // Clicking the ambient button opens/closes the slider popover
    ambientBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !ambientPill?.classList.contains("popover-open");
      ambientPill?.classList.toggle("popover-open", willOpen);
      ambientBtn.setAttribute("aria-expanded", String(willOpen));

      // If opening and sound is not currently on, start it up automatically at default volume
      if (willOpen && (!ambient.enabled || ambient.volume <= 0)) {
        if (ambient.volume <= 0) ambient.volume = 0.33;
        ambient.enabled = true;
        if (!sound.enabled) {
          sound.enabled = true;
          if (soundBtn) soundBtn.style.opacity = "1";
        }
        ambient.saveState();
        ambient.sync();
        paintAmbientUI();
        sound.playClick(520, 0.05, "triangle", 0.08);
      }
    });

    // Mute/Unmute quick toggle button inside popover
    ambientMuteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      ambient.toggle();
      paintAmbientUI();
      if (ambient.enabled) sound.playClick(520, 0.05, "triangle", 0.08);
    });

    // Close popover when clicking anywhere outside
    document.addEventListener("click", (e) => {
      if (ambientPill && !ambientPill.contains(e.target)) {
        ambientPill.classList.remove("popover-open");
        ambientBtn?.setAttribute("aria-expanded", "false");
      }
    });

    // Close popover on Escape key
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        ambientPill?.classList.contains("popover-open")
      ) {
        ambientPill.classList.remove("popover-open");
        ambientBtn?.setAttribute("aria-expanded", "false");
      }
    });

    ambientSlider?.addEventListener("input", (e) => {
      const pct = Number(e.target.value);
      if (!sound.enabled && pct > 0) {
        sound.enabled = true;
        if (soundBtn) soundBtn.style.opacity = "1";
      }
      ambient.setVolume(pct / 100);
      paintAmbientUI();
    });

    // Observer's guide modal
    const howToModal = document.getElementById("howto-modal");
    document.getElementById("btn-howto")?.addEventListener("click", () => {
      sound.playClick(440, 0.05, "triangle", 0.08);
      // On the hub the compass tells about Focal; inside a game it opens that instrument's guide
      if (this.currentView === "hub") this.openAboutModal();
      else this.openHowToModal();
    });
    document
      .getElementById("close-howto-btn")
      ?.addEventListener("click", () => {
        howToModal.classList.add("hidden");
      });
    howToModal?.addEventListener("click", (e) => {
      if (e.target === howToModal) howToModal.classList.add("hidden");
    });

    // Win modal
    const winModal = document.getElementById("win-modal");
    document.getElementById("close-win-btn")?.addEventListener("click", () => {
      winModal.classList.add("hidden");
    });
    winModal?.addEventListener("click", (e) => {
      if (e.target === winModal) winModal.classList.add("hidden");
    });

    document.getElementById("btn-copy-share")?.addEventListener("click", () => {
      if (!this.lastWinSummary) return;
      navigator.clipboard
        .writeText(`${this.lastWinSummary.shareText}\n- the gentle observatory`)
        .then(() => {
          const btn = document.getElementById("btn-copy-share");
          btn.innerHTML = `${ico("check")}<span>note copied</span>`;
          setTimeout(() => {
            btn.innerHTML = `<span>share this note</span>`;
          }, 2000);
        });
    });

    document.getElementById("btn-win-next")?.addEventListener("click", () => {
      winModal.classList.add("hidden");
      if (this.playMode === "endless") {
        this.nextRandomEndlessPuzzle();
      } else {
        this.setPlayMode("endless");
      }
    });

    document.getElementById("btn-win-hub")?.addEventListener("click", () => {
      winModal.classList.add("hidden");
      this.navigateTo("#hub");
    });
  }

  updateClockAndProgressUI() {
    const isEndless = this.playMode === "endless";

    document
      .querySelectorAll("#hub-mode-daily, #game-mode-daily")
      .forEach((btn) => {
        btn.classList.toggle("active", !isEndless);
      });
    document
      .querySelectorAll("#hub-mode-endless, #game-mode-endless")
      .forEach((btn) => {
        btn.classList.toggle("active", isEndless);
      });

    const randomBtn = document.getElementById("btn-random-seed");
    if (randomBtn) {
      randomBtn.classList.toggle("hidden", !isEndless);
    }

    const seedBadge = document.getElementById("current-seed-badge");
    if (seedBadge) {
      const activeSeed = this.getActiveSeed();
      seedBadge.textContent = formatSeedLabel(activeSeed);
      seedBadge.classList.toggle("is-vault", isEndless);
    }

    // Hub texts
    const headline = document.getElementById("hub-headline-text");
    const subline = document.getElementById("hub-subline-text");
    const progressText = document.getElementById("daily-progress-text");
    const lanternRow = document.getElementById("lantern-row");

    if (headline) {
      headline.innerHTML = isEndless
        ? "The archive of <em>old skies</em>."
        : "Eight small instruments, <em>tuned gently</em> each day.";
    }
    if (subline) {
      subline.textContent = isEndless
        ? "Every sky ever recorded is kept here. Wander through them at your own pace: no lanterns to light, nothing to keep."
        : this.solvedToday.size === GAME_KEYS.length
          ? SEALED_LOG
          : "Each midnight the wind, the sea and the sky drift out of tune. Sit by the window and guide them gently back.";
    }
    if (progressText) {
      const count = this.solvedToday.size;
      progressText.innerHTML = isEndless
        ? "wander freely"
        : count === GAME_KEYS.length
          ? `the log is sealed`
          : `${count} / ${GAME_KEYS.length} in tune`;
    }
    if (lanternRow) {
      lanternRow.style.display = isEndless ? "none" : "";
      GAME_KEYS.forEach((key) => {
        lanternRow
          .querySelector(`[data-lantern="${key}"]`)
          ?.classList.toggle("lit", this.solvedToday.has(key));
      });
    }

    // Header clock pill
    const issueEl = document.getElementById("daily-issue-text");
    const countdownEl = document.getElementById("daily-countdown-text");
    if (issueEl) issueEl.textContent = `day #${this.issueNumber}`;
    if (countdownEl)
      countdownEl.textContent = `new sky in ${getMidnightCountdown()}`;

    // Completion dots & card badges
    GAME_KEYS.forEach((key) => {
      const isDone = this.solvedToday.has(key);
      const dot = document.querySelector(`[data-solved-dot="${key}"]`);
      const cardStatus = document.querySelector(`[data-card-status="${key}"]`);
      if (dot) dot.classList.toggle("active", isDone);
      if (cardStatus) {
        if (isEndless) {
          cardStatus.textContent = "open to wander";
          cardStatus.classList.remove("is-solved");
        } else {
          cardStatus.innerHTML = isDone ? `in tune` : "ready to tune";
          cardStatus.classList.toggle("is-solved", isDone);
        }
      }
    });
  }

  openHowToModal() {
    const lore = OBSERVATORY_LORE[this.activeGameKey];
    const info = lore?.howTo;
    const body = document.getElementById("howto-modal-body");
    if (!info || !body) return;

    body.innerHTML = `
      <div class="modal-header-block">
        <span class="guide-kicker">${instrumentLabel(this.activeGameKey)}</span>
        <h2 style="margin-top:6px;">${info.title}</h2>
        <p class="guide-sub">"${info.subtitle}"</p>
      </div>
      <div class="howto-steps">
        ${info.steps
          .map(
            (s) => `
          <div class="howto-step-card">
            <div class="howto-step-icon">${s.icon}</div>
            <div class="howto-step-text">
              <h4>${s.heading}</h4>
              <p>${s.text}</p>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    document.getElementById("howto-modal")?.classList.remove("hidden");
  }

  openAboutModal() {
    const body = document.getElementById("howto-modal-body");
    if (!body) return;

    const cards = [
      {
        icon: "01",
        heading: "One sky a day",
        text: "Eight small instruments, a new set every day, the same for everyone on the same date. Bring them all into tune to seal the day's logbook. At midnight the world drifts out of tune again.",
      },
      {
        icon: "02",
        heading: "No pressure",
        text: "No timers, no sirens, no failures. A wrong turn only sends a small ripple across the water. Hints are there when you want them.",
      },
      {
        icon: "03",
        heading: "The archive",
        text: "Finished early? Switch a puzzle to the archive to draw a fresh sky from the past, as often as you like.",
      },
      {
        icon: "04",
        heading: "Yours, on your device",
        text: "No account and no analytics. Your progress lives in this browser, and Focal can be installed to your home screen and played offline.",
      },
    ];

    body.innerHTML = `
      <div class="modal-header-block">
        <span class="guide-kicker">the gentle observatory</span>
        <h2 style="margin-top:6px;">About Focal</h2>
        <p class="guide-sub">"You keep a quiet lighthouse. Every day the wind, the sea and the sky drift slightly out of tune, and you gently set them right."</p>
      </div>
      <div class="howto-steps">
        ${cards
          .map(
            (c) => `
          <div class="howto-step-card">
            <div class="howto-step-icon">${c.icon}</div>
            <div class="howto-step-text">
              <h4>${c.heading}</h4>
              <p>${c.text}</p>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    document.getElementById("howto-modal")?.classList.remove("hidden");
  }

  handleGameWin(gameKey, summary) {
    if (this.playMode === "daily") {
      this.solvedToday.add(gameKey);
      this.saveDailyProgress();
    }
    this.updateClockAndProgressUI();
    this.lastWinSummary = summary;

    const isEndless = this.playMode === "endless";
    const winBody = document.getElementById("win-modal-body");
    if (winBody) {
      const cols = summary.gridCols || 5;
      const cellsHtml = (summary.visualCells || [])
        .map((c) => {
          const cls = typeof c === "string" ? c : c?.type || "empty";
          const lbl =
            typeof c === "object" && c?.label
              ? c.label
              : cls === "pivot"
                ? ico("ripple")
                : "";
          return `<span class="win-vcell ${cls}">${lbl}</span>`;
        })
        .join("");

      const modulesHtml = GAME_KEYS.map((k) => {
        const done = this.solvedToday.has(k);
        const isCurrent = k === gameKey;
        return `
          <button class="win-mod-pill ${done ? "done" : ""} ${isCurrent ? "current" : ""}" data-win-jump="${k}">
            <span class="win-mod-dot"></span>
            <span>${MODULE_NAMES[k]}</span>
          </button>
        `;
      }).join("");

      const statLabel = (label, fallback) => label || fallback;
      const gameName = (
        summary.gameName || MODULE_NAMES[gameKey]
      ).toLowerCase();

      winBody.innerHTML = `
        <div class="win-meta-row">
          <span class="win-pill-soft">${formatSeedLabel(summary.seed)}</span>
          <span class="win-pill-soft">${isEndless ? "a pleasant wander" : "in tune"}</span>
        </div>

        <div class="win-hero-block">
          <h2 class="win-lead">The ${gameName} has found its harmony</h2>
          <p class="win-note">${summary.subtitle || "Beautifully tuned. The room feels a little warmer now."}</p>
        </div>

        <div class="win-stats-strip">
          <div class="win-stat-box">
            <span class="win-stat-lbl">${statLabel(summary.stat1Label, "time")}</span>
            <strong class="win-stat-val">${summary.stat1Value || "-"}</strong>
          </div>
          <div class="win-stat-box">
            <span class="win-stat-lbl">${statLabel(summary.stat2Label, "moves")}</span>
            <strong class="win-stat-val">${summary.stat2Value ?? "0"}</strong>
          </div>
          <div class="win-stat-box">
            <span class="win-stat-lbl">${statLabel(summary.stat3Label, "hints")}</span>
            <strong class="win-stat-val highlight">${summary.stat3Value ?? "0"}</strong>
          </div>
        </div>

        <div class="win-matrix-showcase" style="margin:20px 0;">
          ${
            summary.visualSvg
              ? `<div class="win-visual-svg">${summary.visualSvg}</div>`
              : `<div class="win-visual-matrix" style="--cols:${cols}; grid-template-columns: repeat(${cols}, minmax(0, 1fr));">
            ${cellsHtml}
          </div>`
          }
        </div>

        <div class="win-daily-progress-block">
          <div class="win-progress-head">
            <span>${isEndless ? "from the archive" : "today's instruments"}</span>
            <strong>${isEndless ? ico("moon") : `${this.solvedToday.size} / ${GAME_KEYS.length} in tune`}</strong>
          </div>
          <div class="win-mod-pills-row">
            ${modulesHtml}
          </div>
        </div>
      `;

      winBody.querySelectorAll("[data-win-jump]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetKey = btn.dataset.winJump;
          document.getElementById("win-modal")?.classList.add("hidden");
          const hash = GAME_TO_HASH[targetKey];
          if (hash) this.navigateTo(hash);
        });
      });
    }

    const nextBtn = document.getElementById("btn-win-next");
    if (nextBtn) {
      nextBtn.classList.remove("hidden");
      nextBtn.innerHTML = `<span>${isEndless ? "another sky" : "wander the archive"}</span>${ico("beam")}`;
    }

    document.getElementById("win-modal")?.classList.remove("hidden");
  }
}

// Paint the clock-driven sky before the app renders so the first frame is already correct.
if (typeof window !== "undefined") {
  atmosphere.start();

  window.addEventListener("DOMContentLoaded", () => {
    new ObservatoryApp();
  });
}
