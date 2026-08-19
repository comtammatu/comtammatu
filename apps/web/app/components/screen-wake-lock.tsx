"use client";

import { useEffect } from "react";

/**
 * Keep a visible station board awake (KDS + Gọi số / Android TV). Fail soft
 * when the API is missing, denied, or the document is hidden. Not a product
 * surface — no copy, no controls.
 */
export function ScreenWakeLock() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => {
          if (!cancelled && document.visibilityState === "visible") {
            void acquire();
          }
        });
      } catch {
        // Unsupported, permission denied, or battery saver — boards still render.
      }
    };

    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, []);

  return null;
}
