"use client";

import { useEffect } from "react";

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function resetDevelopmentWorker() {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const hadController = navigator.serviceWorker.controller != null;

      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );

      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(
          cacheNames.map((cacheName) => window.caches.delete(cacheName)),
        );
      }

      if (!cancelled && hadController && registrations.length > 0) {
        window.location.reload();
      }
    }

    void resetDevelopmentWorker().catch((error: unknown) => {
      console.warn("[pwa] failed to reset development service worker", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
