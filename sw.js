'use strict';

/* Varallisuuspolku — service worker: offline-tuki ilman vanhentumisriskiä.
   Strategia: verkko ensin, onnistunut vastaus välimuistiin, offline-tilassa
   välimuistista. Näin julkaisut päivittyvät heti kun verkko on käytössä,
   mutta sovellus toimii myös kokonaan ilman yhteyttä. */

const CACHE = 'varallisuuspolku-v2';
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './fonts.css',
  './fonts/inter-latin.woff2',
  './fonts/inter-latin-ext.woff2',
  './favicon.svg',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Yksittäisen tiedoston puuttuminen ei saa estää asennusta
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
