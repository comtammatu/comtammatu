/** Wire cookie name for light/night override. Stable across branding renames. */
export const THEME_COOKIE_NAME = "matu-theme";

export type ThemeMode = "light" | "night";

/**
 * Shift-aware boundary. Night runs 18:00–06:00 local hour, matching the service
 * shift rather than the OS preference, so a station keeps one look per shift.
 */
export const NIGHT_SHIFT_START_HOUR = 18;
export const NIGHT_SHIFT_END_HOUR = 6;

/** DOM class for a mode. The `dark` class is what globals.css scopes against. */
export function themeClassName(mode: ThemeMode): "light" | "dark" {
  return mode === "night" ? "dark" : "light";
}

export function resolveThemeMode(
  value: string | null | undefined,
): ThemeMode | null {
  return value === "light" || value === "night" ? value : null;
}

export function shiftAwareThemeMode(hour: number): ThemeMode {
  return hour >= NIGHT_SHIFT_START_HOUR || hour < NIGHT_SHIFT_END_HOUR
    ? "night"
    : "light";
}

/**
 * Parse the override out of a `document.cookie` string. Kept string-in so the
 * same reader serves client components and the bare global-error tree.
 */
export function readThemeCookie(
  cookieString: string | null | undefined,
): ThemeMode | null {
  if (!cookieString) return null;
  const match = cookieString.match(
    new RegExp(`(^|;)\\s*${THEME_COOKIE_NAME}\\s*=\\s*([^;]+)`),
  );
  if (!match) return null;
  return resolveThemeMode(decodeURIComponent(match[2]!.trim()));
}

/** Cookie override first, then the shift-aware fallback for the current hour. */
export function resolveClientThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return (
    readThemeCookie(document.cookie) ??
    shiftAwareThemeMode(new Date().getHours())
  );
}
