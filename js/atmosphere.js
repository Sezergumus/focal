// Atmosphere Engine: The Gentle Observatory
// Time-of-day sky (continuous, no CSS animation) + weekday theme (scale, timbre, celestial aura).
//
// The sky is a single fixed gradient following natural atmospheric transitions:
//   - Night: deep starry navy
//   - Dawn: lavender mist into warm apricot horizon
//   - Day: serene, luminous mountain azure (bright & clear at noon, never greenish or dark)
//   - Dusk: indigo into sunset coral & rose
//
// Every 5 minutes the palette is recomputed from the clock and written to CSS custom properties.
// Nothing in the sky animates continuously.
//
// Preview helpers (URL only): index.html?hour=12&day=3
//   hour = 0..24 (fractional allowed), day = 0 (Sunday) .. 6 (Saturday)

const UPDATE_MS = 60 * 1000;

// --- Natural Sky keyframes (local hour -> sweet, cozy time-of-day palette) ---
const SKY_KEYS = [
  { h: 0,    top: '#1e1633', mid: '#31234b', low: '#4c3566', hill: '#19122b', card: '#2a1e42', well: '#1a122b', stars: 1,    daylight: 0,    core: '#fffdf4', edge: '#fbe5c0' },
  { h: 3.5,  top: '#231a3a', mid: '#3a2956', low: '#5c3f73', hill: '#1d1530', card: '#2e2147', well: '#1d142e', stars: 0.95, daylight: 0,    core: '#fffdf4', edge: '#fbe5c0' },
  { h: 5.5,  top: '#3f2e5e', mid: '#825480', low: '#eba198', hill: '#32234a', card: '#453059', well: '#2b1d3b', stars: 0.15, daylight: 0.4,  core: '#fff3de', edge: '#ffc69c' },
  { h: 7.5,  top: '#5e4368', mid: '#b56c84', low: '#f7c299', hill: '#493357', card: '#543a61', well: '#362440', stars: 0,    daylight: 0.85, core: '#fff8e6', edge: '#ffd08a' },
  { h: 10,   top: '#68547d', mid: '#a87d9e', low: '#f4cfb4', hill: '#4e3e63', card: '#524066', well: '#352844', stars: 0,    daylight: 1,    core: '#fffdf2', edge: '#ffe299' },
  { h: 12.5, top: '#635c85', mid: '#9d89ad', low: '#f5d6c0', hill: '#4b4163', card: '#504468', well: '#332a45', stars: 0,    daylight: 1,    core: '#fffef5', edge: '#ffe58f' },
  { h: 15,   top: '#6b5278', mid: '#b3758e', low: '#f6bf94', hill: '#503d61', card: '#574166', well: '#382844', stars: 0,    daylight: 0.95, core: '#fff9e6', edge: '#ffcf85' },
  { h: 17.5, top: '#523666', mid: '#ab5876', low: '#f29a7c', hill: '#3b264d', card: '#4a2f59', well: '#2e1c3a', stars: 0.05, daylight: 0.55, core: '#ffebd1', edge: '#ffa066' },
  { h: 19.5, top: '#382452', mid: '#78426b', low: '#cf7884', hill: '#291b40', card: '#3a2652', well: '#241636', stars: 0.35, daylight: 0.2,  core: '#fff2de', edge: '#f7b28b' },
  { h: 21.5, top: '#251a3d', mid: '#402b5c', low: '#664478', hill: '#1e1533', card: '#30224a', well: '#1e1430', stars: 0.9,  daylight: 0,    core: '#fffdf4', edge: '#fbe5c0' },
  { h: 24,   top: '#1e1633', mid: '#31234b', low: '#4c3566', hill: '#19122b', card: '#2a1e42', well: '#1a122b', stars: 1,    daylight: 0,    core: '#fffdf4', edge: '#fbe5c0' }
];

// --- Weekday themes ---------------------------------------------------------
// Each day brings a distinct musical scale, acoustic timbre, and gentle celestial aura.
// Scales are semitone-free pentatonics, ensuring warm consonance at all times.
const SCALES = {
  major: [0, 2, 4, 7, 9],
  minor: [0, 3, 5, 7, 10],
  suspended: [0, 2, 5, 7, 10],
  yo: [0, 2, 5, 7, 9]
};

export const DAY_THEMES = [
  { id: 'sun',  name: 'Sunday · Tibetan Bowl',  root: 174.61, scale: SCALES.suspended, reg: 1, timbre: { partials: [[1, 1], [2, 0.25], [3, 0.08]], attack: 0.04,  decay: 2.6 }, aura: '255, 230, 180' },
  { id: 'mon',  name: 'Monday · Bell',          root: 261.63, scale: SCALES.major,     reg: 1, timbre: { partials: [[1, 1], [2, 0.18], [3, 0.06]], attack: 0.008, decay: 1.1 }, aura: '255, 238, 190' },
  { id: 'tue',  name: 'Tuesday · Glass',        root: 220.0,  scale: SCALES.minor,     reg: 1, timbre: { partials: [[1, 1], [3, 0.05]],            attack: 0.012, decay: 1.6 }, aura: '240, 245, 255' },
  { id: 'wed',  name: 'Wednesday · Kalimba',    root: 293.66, scale: SCALES.suspended, reg: 1, timbre: { partials: [[1, 1], [4, 0.1]],             attack: 0.006, decay: 0.5 }, aura: '255, 232, 200' },
  { id: 'thu',  name: 'Thursday · Harp',        root: 196.0,  scale: SCALES.major,     reg: 1, timbre: { partials: [[1, 1], [2, 0.3], [3, 0.12]],  attack: 0.006, decay: 0.8 }, aura: '255, 225, 175' },
  { id: 'fri',  name: 'Friday · Wind Chimes',   root: 329.63, scale: SCALES.yo,        reg: 1, timbre: { partials: [[1, 1], [2, 0.1], [5, 0.04]],  attack: 0.01,  decay: 1.4 }, aura: '245, 240, 255' },
  { id: 'sat',  name: 'Saturday · Music Box',   root: 220.0,  scale: SCALES.major,     reg: 2, timbre: { partials: [[1, 1], [3, 0.2]],             attack: 0.006, decay: 0.35 }, aura: '255, 220, 195' }
];

// --- Colour helpers ---------------------------------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const lerpRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const rgbCss = (rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

// --- Pure state computation (also used by tests) ----------------------------
export function getPhaseName(hour) {
  if (hour >= 21.5 || hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 18) return 'day';
  return 'dusk';
}

export function getDayTheme(day) {
  return DAY_THEMES[((day % 7) + 7) % 7];
}

export function getSkyState(hour, theme) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1].h) i += 1;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = smoothstep(Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h))));
  const mix = (key) => lerpRgb(hexToRgb(a[key]), hexToRgb(b[key]), t);

  // Sun travels 06:00-19:00, moon 19:00-06:00. Both ride one natural parabolic arc.
  const isSun = hour >= 6 && hour < 19;
  const p = isSun ? (hour - 6) / 13 : ((hour >= 19 ? hour - 19 : hour + 5)) / 11;
  const arc = Math.sin(Math.PI * p);

  // Celestial halo blends base sun/moon color with the day's subtle aura
  const baseEdge = mix('edge');
  const glowRgb = theme && theme.aura ? theme.aura : baseEdge.join(',');
  const cardRgb = mix('card').join(', ');
  const wellRgb = mix('well').join(', ');

  return {
    phase: getPhaseName(hour),
    top: rgbCss(mix('top')),
    mid: rgbCss(mix('mid')),
    low: rgbCss(mix('low')),
    hill: rgbCss(mix('hill')),
    cardRgb,
    wellRgb,
    stars: +lerp(a.stars, b.stars, t).toFixed(3),
    daylight: +lerp(a.daylight, b.daylight, t).toFixed(3),
    core: rgbCss(mix('core')),
    edge: rgbCss(baseEdge),
    edgeRgb: glowRgb,
    bodyX: +(6 + 88 * p).toFixed(2),
    bodyY: +(96 - 84 * arc).toFixed(2),
    bodySize: isSun ? 64 : 52
  };
}

// --- Runtime ----------------------------------------------------------------
function readPreview() {
  try {
    const params = new URLSearchParams(window.location.search);
    const hour = parseFloat(params.get('hour'));
    const day = parseInt(params.get('day'), 10);
    return {
      hour: Number.isFinite(hour) ? Math.min(24, Math.max(0, hour)) : null,
      day: Number.isFinite(day) ? day : null
    };
  } catch {
    return { hour: null, day: null };
  }
}

class Atmosphere {
  constructor() {
    this.preview = readPreview();
    this.listeners = new Set();
    this.timer = null;
    this.currentTheme = getDayTheme(this.now().day);
    this.currentSky = getSkyState(this.now().hour, this.currentTheme);
  }

  now() {
    const d = new Date();
    return {
      hour: this.preview.hour ?? d.getHours() + d.getMinutes() / 60,
      day: this.preview.day ?? d.getDay()
    };
  }

  get theme() {
    return this.currentTheme;
  }

  get sky() {
    return this.currentSky;
  }

  onChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // Scale degree -> Hz. Degrees outside 0..4 wrap through octaves (negative = below the root).
  noteFreq(degree, theme = this.currentTheme) {
    const n = theme.scale.length;
    const octave = Math.floor(degree / n);
    const semis = theme.scale[((degree % n) + n) % n] + 12 * octave;
    return theme.root * theme.reg * Math.pow(2, semis / 12);
  }

  apply() {
    const { hour, day } = this.now();
    this.currentTheme = getDayTheme(day);
    this.currentSky = getSkyState(hour, this.currentTheme);
    const s = this.currentSky;
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);

    set('--sky-top', s.top);
    set('--sky-mid', s.mid);
    set('--sky-low', s.low);
    set('--hill', s.hill);
    set('--card-rgb', s.cardRgb);
    set('--well-rgb', s.wellRgb);
    set('--star-opacity', String(s.stars));
    set('--body-core', s.core);
    set('--body-edge', s.edge);
    set('--body-glow-rgb', s.edgeRgb);
    set('--body-x', String(s.bodyX));
    set('--body-y', String(s.bodyY));
    set('--body-size', `${s.bodySize}px`);
    root.dataset.phase = s.phase;
    root.dataset.dayTheme = this.currentTheme.id;

    const pill = document.querySelector('.daily-clock-pill');
    if (pill) {
      pill.title = `${this.currentTheme.name} - each midnight the sky changes and the instruments drift out of tune again`;
    }

    this.listeners.forEach((cb) => cb(this.currentSky, this.currentTheme));
  }

  start() {
    if (this.timer) return;
    this.apply();
    // Enable the one-off 2s glide only after the first paint so the page never slides on load.
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.documentElement?.classList.add('sky-ready');
      }));
    }
    this.timer = setInterval(() => this.apply(), UPDATE_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.apply();
      });
    }
  }
}

export const atmosphere = new Atmosphere();
