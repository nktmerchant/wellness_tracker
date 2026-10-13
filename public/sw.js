/*
 * Offline support. The app shell is cached as it is fetched, so after one
 * online visit the installed app opens with no network.
 *
 *   page (navigation)  network first, cached copy when offline — so a new
 *                      deploy is picked up on the next online launch
 *   assets/*           cache first: Vite fingerprints these filenames, so a
 *                      cached copy can never be stale
 *   everything else    cached copy at once, refreshed in the background
 *
 * Only same-origin GETs are handled. Supabase calls go straight to the
 * network; the app keeps its own offline copy of the data (see store.ts).
 */
const CACHE = 'triangle-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  const fetchAndStore = () =>
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });

  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetchAndStore()));
    return;
  }

  const fresh = fetchAndStore();
  event.respondWith(caches.match(req).then((hit) => hit || fresh));
  event.waitUntil(fresh.catch(() => {}));
});
