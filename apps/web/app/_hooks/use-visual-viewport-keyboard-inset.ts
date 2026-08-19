"use client";

import { useEffect } from "react";

/**
 * Lifts POS fixed bottom chrome above the iOS/Android software keyboard
 * without a JSX `style={{}}` (ui-contract presentation-inline-style freeze).
 * Writes `--visual-viewport-keyboard-inset` for `pos-keyboard-lift`.
 */
export function useVisualViewportKeyboardInset(): void {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    if (viewport == null) return;

    const sync = () => {
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      root.style.setProperty("--visual-viewport-keyboard-inset", `${inset}px`);
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      root.style.removeProperty("--visual-viewport-keyboard-inset");
    };
  }, []);
}
