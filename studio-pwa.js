(function () {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("./studio-service-worker.js").catch(() => {}));
})();
