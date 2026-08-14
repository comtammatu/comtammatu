"use client";

import { useEffect } from "react";

/**
 * Enforces light mode ("Chế độ ngày") on operational and guest-facing surfaces
 * (KDS, POS, Pickup, Self-Order). Removes the `.dark` class from documentElement
 * during mount and restores the previous theme state on unmount without mutating
 * the user's persisted theme cookie or localStorage.
 */
export function ForceLightMode() {
  useEffect(() => {
    const root = document.documentElement;
    const hadLight = root.classList.contains("light");
    const hadDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;
    const applyLightMode = () => {
      root.classList.remove("dark");
      root.classList.add("light");
      root.style.colorScheme = "light";
    };

    applyLightMode();
    const timeoutId = window.setTimeout(applyLightMode, 0);

    return () => {
      window.clearTimeout(timeoutId);
      root.classList.remove("light", "dark");
      if (hadLight) root.classList.add("light");
      if (hadDark) root.classList.add("dark");
      root.style.colorScheme = previousColorScheme;
    };
  }, []);

  return null;
}
