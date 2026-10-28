// Network-first for the app itself so edits and deploys show up right away;
// the cache is only the offline fallback. Bump CACHE if you ever change the strategy.
const CACHE = "focal-v1";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./js/atmosphere.js",
  "./js/audio.js",
  "./js/game-circuit.js",
  "./js/game-denge.js",
  "./js/game-eko.js",
  "./js/game-knot.js",
  "./js/game-prism.js",
  "./js/game-resonance.js",
  "./js/game-sonar.js",
  "./js/game-spectrum.js",
  "./js/icons.js",
  "./js/main.js",
  "./js/observatory-audio.js",
  "./js/observatory-main.js",
  "./js/rng.js",
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // ?seed=... style query strings still resolve to the cached page
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") return cache.match("./index.html");
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
