"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { THEME_COOKIE_NAME } from "../lib/theme-cookie";

export type ThemeMode = "light" | "night";

export type ThemeContextValue = {
  theme: ThemeMode;
  resolvedTheme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = THEME_COOKIE_NAME;
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
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);
  const mountedRef = useRef(false);

  // Preserve the pre-hydration class until the client resolves the same source.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setThemeState(readCookieTheme() ?? shiftAwareFallback());
      return;
    }
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const next = theme === "night" ? "dark" : "light";
    const transitionStyle = disableTransitionOnChange
      ? document.createElement("style")
      : null;
    if (transitionStyle) {
      transitionStyle.textContent =
        "*,*::before,*::after{transition:none!important}";
      document.head.appendChild(transitionStyle);
    }
    root.classList.remove("light", "dark");
    root.classList.add(next);
    root.style.colorScheme = next;
    if (transitionStyle) {
      void getComputedStyle(root).opacity;
      requestAnimationFrame(() => transitionStyle.remove());
    }
  }, [disableTransitionOnChange, theme]);

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
