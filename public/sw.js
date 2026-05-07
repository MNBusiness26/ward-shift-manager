// Minimal service worker for PWA install criteria.
// Does NOT cache responses to avoid stale-content issues during development.
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  // pass-through; no caching
});
