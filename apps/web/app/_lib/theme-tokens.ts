export type MatuThemeMode = "light" | "night";

export const MATU_THEME_COOKIE_NAME = "matu-theme";

// Exact sRGB of the `--background` token per theme (packages/ui/src/styles/globals.css).
// design-token-contrast-static.test.ts asserts the equality.
export const BROWSER_CHROME_THEME_COLORS: Record<MatuThemeMode, string> = {
  light: "#fff6ee",
  night: "#120a06",
};

export const GLOBAL_ERROR_PALETTE: Record<
  MatuThemeMode,
  {
    background: string;
    foreground: string;
    muted: string;
    border: string;
    surface: string;
  }
> = {
  light: {
    background: BROWSER_CHROME_THEME_COLORS.light,
    foreground: "#1a2238",
    muted: "#6b5b47",
    border: "#e8dcc8",
    surface: "#ffffff",
  },
  night: {
    background: BROWSER_CHROME_THEME_COLORS.night,
    foreground: "#f5ebd9",
    muted: "#c9b896",
    border: "#3a2f24",
    surface: "#2a2218",
  },
};

export function resolveMatuThemeMode(
  value: string | null | undefined,
): MatuThemeMode | null {
  return value === "light" || value === "night" ? value : null;
}
