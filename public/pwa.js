// Registers the service worker (see sw.js) for installability. Silently
// no-ops in browsers without support (e.g. some older Safari) or on
// non-HTTPS localhost dev — never blocks the rest of the page either way.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] service worker registration failed:", err);
    });
  });
}
