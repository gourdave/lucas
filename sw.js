// sw.js — network-first service worker: always serve the freshest game when
// online (so updates appear immediately), fall back to cache when offline.
const CACHE = 'bumpercrop-v16';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './js/main.js',
  './js/state.js',
  './js/controls.js',
  './js/world.js',
  './js/house.js',
  './js/creatures.js',
  './js/monsters.js',
  './js/shop.js',
  './js/dreams.js',
  './js/therapist.js',
  './js/ui.js',
  './js/audio.js',
  './js/progression.js',
  './js/garden.js',
  './js/pets.js',
  './js/journal.js',
  './js/boss.js',
  './js/decor.js',
  './js/lb.js',
  './js/fishing.js',
  './js/digsite.js',
  './js/listener.js',
  './js/wcdonalds.js',
  './js/mysteries.js',
  './js/gfx.js',
  './js/maze.js',
  './js/borrower.js',
  './js/camps.js',
  './js/tower.js',
  './js/scarecrow.js',
  './js/gate.js',
  './js/vendor/three.module.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
