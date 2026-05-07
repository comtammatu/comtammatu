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

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

export type ThemeContextValue = {
  theme: Theme | undefined;
  resolvedTheme: Resolved | undefined;
  systemTheme: Resolved | undefined;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_STORAGE_KEY = "theme";

function readStored(storageKey: string): Theme | undefined {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    /* localStorage unavailable */
  }
  return undefined;
}

function readSystem(): Resolved {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function disableTransitions() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);
  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}

function applyResolved(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  attribute?: "class";
  storageKey?: string;
};

export function ThemeProvider({
  children,
  defaultTheme = "system",
  disableTransitionOnChange = false,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return readStored(storageKey) ?? defaultTheme;
  });
  const [systemTheme, setSystemTheme] = useState<Resolved | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return readSystem();
  });
  const isFirstApply = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(mq.matches ? "dark" : "light");
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: Resolved | undefined =
    theme === "system"
      ? systemTheme
      : theme === "light" || theme === "dark"
        ? theme
        : undefined;

  useEffect(() => {
    if (resolvedTheme === undefined) return;
    let restore: (() => void) | undefined;
    if (disableTransitionOnChange && !isFirstApply.current) {
      restore = disableTransitions();
    }
    applyResolved(resolvedTheme);
    isFirstApply.current = false;
    restore?.();
  }, [resolvedTheme, disableTransitionOnChange]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const next = e.newValue;
      if (next === "light" || next === "dark" || next === "system") {
        setThemeState(next);
      } else {
        setThemeState(defaultTheme);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [defaultTheme, storageKey]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* localStorage unavailable */
      }
    },
    [storageKey],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      systemTheme,
      setTheme,
    }),
    [theme, resolvedTheme, systemTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    theme: undefined,
    resolvedTheme: undefined,
    systemTheme: undefined,
    setTheme: () => {},
  };
}
