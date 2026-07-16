const CACHE_NAME = "zz-studio-shell-v2";
const SHELL = [
  "./studio.html",
  "./card-editor.html",
  "./studio.css",
  "./studio-trash.css",
  "./studio-cloud.css",
  "./card-editor.css",
  "./card-editor-extra.css",
  "./studio-cloud-config.js",
  "./studio-cloud-api.js",
  "./studio.js",
  "./card-editor.js",
  "./studio-pwa.js",
  "./manifest.webmanifest",
  "./zz-logo-icon.png",
  "./zz-logo-with-wechat.png",
  "./zz-watermark-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./studio.html"))));
});
