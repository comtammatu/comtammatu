export {
  THEME_COOKIE_NAME,
  resolveThemeMode,
  shiftAwareThemeMode,
  readThemeCookie,
  type ThemeMode,
} from "@comtammatu/ui/lib/theme-cookie";

import type { ThemeMode } from "@comtammatu/ui/lib/theme-cookie";

// Exact sRGB of the `--background` token per theme (packages/ui/src/styles/globals.css).
// design-token-contrast-static.test.ts asserts the equality.
export const BROWSER_CHROME_THEME_COLORS: Record<ThemeMode, string> = {
  light: "#fff6ee",
  night: "#120a06",
};

// global-error.tsx renders outside globals.css, so it cannot read tokens at
// runtime. These mirror the light/night semantic tokens of the same name and
// design-token-contrast-static.test.ts asserts the parity.
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
    foreground: "#0d1b2a",
    muted: "#8b5a2b",
    border: "#dccfc0",
    surface: "#ffffff",
  },
  night: {
    background: BROWSER_CHROME_THEME_COLORS.night,
    foreground: "#f8f1e6",
    muted: "#d0c1b1",
    border: "#82776f",
    surface: "#362b25",
  },
};
