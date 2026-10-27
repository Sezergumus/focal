// Serverless Daily Seed & Deterministic PRNG Engine (Mulberry32 + FNV-1a)
// Generates a new deterministic seed every day at 00:00 without needing a backend server.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function createRNG(seedInput) {
  let state = typeof seedInput === 'number' ? (seedInput >>> 0) : hashString(String(seedInput));
  if (state === 0) state = 0xdeadbeef;

  const next = () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }
  };
}

// Returns YYYY-MM-DD for the current local calendar day
export function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Computes the Daily Issue Number (e.g. #300) deterministically from an epoch date
export function getDailyIssueNumber() {
  const epoch = new Date(2026, 0, 1).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - epoch) / 86400000);
  return Math.max(1, diffDays + 1);
}

// Returns human-readable countdown until midnight (00:00) when the new daily seed activates
export function getMidnightCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diffMs = Math.max(0, midnight - now);
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

// Generates a random historical archive seed strictly BEFORE 2026 (1970-01-01 to 2025-12-31)
// 56 years = 20,454 unique date seeds. Never collides with 2026+ daily puzzle seeds.
export function getRandomArchiveSeed(excludeSeeds = []) {
  const startMs = new Date(1970, 0, 1).getTime();
  const endMs = new Date(2025, 11, 31).getTime();
  const dayMs = 86400000;
  const totalDays = Math.floor((endMs - startMs) / dayMs);

  let candidate = '';
  let attempts = 0;
  do {
    const randomOffset = Math.floor(Math.random() * totalDays);
    const date = new Date(startMs + randomOffset * dayMs);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    candidate = `VAULT-${y}-${m}-${d}`;
    attempts++;
  } while (excludeSeeds.includes(candidate) && attempts < 30);

  return candidate;
}

export function formatSeedLabel(seedStr) {
  if (!seedStr) return '';
  if (seedStr.startsWith('DAY-')) {
    return `day #${seedStr.replace('DAY-', '')}`;
  }
  if (seedStr.startsWith('VAULT-')) {
    return `vault #${seedStr.replace('VAULT-', '')}`;
  }
  return seedStr.toLowerCase();
}
