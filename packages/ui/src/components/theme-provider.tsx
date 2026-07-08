"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "night";

export type ThemeContextValue = {
  theme: ThemeMode;
  resolvedTheme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "matu-theme";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Cookie read must mirror the pre-hydration script in theme-script.tsx so SSR
// matches first paint.
function readCookieTheme(): ThemeMode | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    `(^|;)\\s*${STORAGE_KEY}\\s*=\\s*([^;]+)`,
  );
  const value = match
    ? decodeURIComponent(match.pop()!.split("=").pop()!)
    : "";
  return value === "light" || value === "night" ? value : undefined;
}

function shiftAwareFallback(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? "night" : "light";
}

function writeCookieTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(
    theme,
  )}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
}

export type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: ThemeMode;
  attribute?: "class";
  disableTransitionOnChange?: boolean;
  storageKey?: string;
};

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);

  // Resolve once on mount to stay in sync with the pre-hydration script.
  useEffect(() => {
    const resolved = readCookieTheme() ?? shiftAwareFallback();
    setThemeState(resolved);
  }, []);

  // Apply class on `<html>` whenever the theme changes.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const next = theme === "night" ? "dark" : "light";
    root.classList.remove("light", "dark");
    root.classList.add(next);
    root.style.colorScheme = next;
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    writeCookieTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === "night" ? "light" : "night";
      writeCookieTheme(next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

const FALLBACK: ThemeContextValue = {
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  return ctx ?? FALLBACK;
}
