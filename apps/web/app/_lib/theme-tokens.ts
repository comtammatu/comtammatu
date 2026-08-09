export { THEME_COOKIE_NAME } from "@comtammatu/ui/lib/theme-cookie";

export type ThemeMode = "light" | "night";

// Exact sRGB of the `--background` token per theme (packages/ui/src/styles/globals.css).
// design-token-contrast-static.test.ts asserts the equality.
export const BROWSER_CHROME_THEME_COLORS: Record<ThemeMode, string> = {
  light: "#fff6ee",
  night: "#120a06",
};

export const GLOBAL_ERROR_PALETTE: Record<
  ThemeMode,
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
    foreground: "#f8f1e6",
    muted: "#d0c1b1",
    border: "#5c4f42",
    surface: "#362b25",
  },
};

export function resolveThemeMode(
  value: string | null | undefined,
): ThemeMode | null {
  return value === "light" || value === "night" ? value : null;
}
