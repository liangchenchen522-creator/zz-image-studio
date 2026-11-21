const CACHE_NAME = "zz-studio-shell-20261121-tabletki1";
const SHELL = [
  "./adult-supplements.html",
  "./antoshka-food.html",
  "./roshen-chocolate.html",
  "./catalog-title-editor.js",
  "./catalog-preview-sort.js",
  "./product-cards.html",
  "./product-cards.css",
  "./product-cards.js",
  "./product-creative-templates.js",
  "./product-warehouse.html",
  "./product-warehouse.js",
  "./product-library-manager.js",
  "./studio-image-upload.js",
  "./studio.html",
  "./mobile.html",
  "./card-editor.html",
  "./studio.css",
  "./studio-trash.css",
  "./studio-actions.css",
  "./studio-cloud.css",
  "./photo-editor.html",
  "./photo-editor.css",
  "./photo-editor-extra.css",
  "./photo-editor.js",
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
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async () => (await caches.match(event.request)) || (await caches.match(event.request,{ignoreSearch:true})) || (event.request.mode==='navigate' ? (await caches.match("./studio.html")) : Response.error())));
});
