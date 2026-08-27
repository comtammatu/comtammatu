"use client";

export type HapticPattern = "light" | "success" | "warning" | "call";

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 40,
  success: [150, 80, 150],
  warning: [200, 100, 200],
  call: [200, 100, 200, 100, 200],
};

/**
 * Triggers safe haptic vibration on supporting mobile devices / PDAs.
 * Fails closed silently if Web Vibration API is unavailable.
 */
export function triggerHapticFeedback(
  pattern: HapticPattern | number | number[] = "light",
): boolean {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }

  try {
    const vibrationPattern =
      typeof pattern === "string" ? HAPTIC_PATTERNS[pattern] ?? 40 : pattern;
    return navigator.vibrate(vibrationPattern);
  } catch {
    return false;
  }
}
