export {}; // avoid TS module scope error

declare let self: ServiceWorkerGlobalScope;

// service-worker.ts
self.addEventListener("install", (event) => {
  console.log("✅ Service Worker installed");
});

self.addEventListener("activate", (event) => {
  console.log("✅ Service Worker activated");
});
