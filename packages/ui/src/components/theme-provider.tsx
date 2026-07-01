"use client";

import { createContext, useContext, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

export type ThemeContextValue = {
  theme: Theme | undefined;
  resolvedTheme: Resolved | undefined;
  systemTheme: Resolved | undefined;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const FIXED_THEME: Resolved = "light";
const FIXED_THEME_CONTEXT: ThemeContextValue = {
  theme: FIXED_THEME,
  resolvedTheme: FIXED_THEME,
  systemTheme: FIXED_THEME,
  setTheme: () => {},
};

export type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  forcedTheme?: Resolved;
  disableTransitionOnChange?: boolean;
  attribute?: "class";
  storageKey?: string;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={FIXED_THEME_CONTEXT}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return FIXED_THEME_CONTEXT;
}
