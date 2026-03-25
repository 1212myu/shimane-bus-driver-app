const CACHE_NAME = 'shimane-bus-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/gtfs.js',
  './js/gps.js',
  './js/matching.js',
  './js/ui.js',
  './js/alert.js',
  './data/stops.json',
  './data/trips.json',
  './data/calendar.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// インストール時に全アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// キャッシュ優先（オフライン対応）
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
