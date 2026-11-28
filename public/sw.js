/*
 * CS2 PRO — service worker (VGL 5.1, Frente 1).
 *
 * Deliberately small and conservative:
 *  - Only GET requests of THIS origin are ever touched; everything else (Supabase, server
 *    functions, POST, auth, the AI Coach, storage signed URLs) goes straight to the network and
 *    is never cached.
 *  - Page navigations are network-first and never cached: an update is visible on the next load
 *    and no private page is stored. Offline, a small static notice is shown instead of stale data.
 *  - Only immutable, content-hashed build files (/assets/*) and public game art (/cs2/*,
 *    /radars/*, /pwa/*) are cached. Hashed names change on every release, so an old cache
 *    can never serve an old app.
 *  - Bumping VERSION drops every previous cache on activation.
 */
const VERSION = "cs2pro-sw-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/pwa/offline.html";
const CACHEABLE = [/^\/assets\//, /^\/cs2\//, /^\/radars\//, /^\/pwa\//];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || new Response("Offline", { status: 503 })),
      ),
    );
    return;
  }

  if (!CACHEABLE.some((re) => re.test(url.pathname)) || url.search) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          if (response.ok && response.type === "basic") cache.put(request, response.clone());
          return response;
        });
      }),
    ),
  );
});
