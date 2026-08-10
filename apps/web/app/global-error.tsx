"use client";

import { useEffect, useState } from "react";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { resolveClientThemeMode } from "@comtammatu/ui/lib/theme-cookie";
import { GLOBAL_ERROR_PALETTE, type ThemeMode } from "./_lib/theme-tokens";

// global-error.tsx is the named inline-style exception (design-system.md
// § Token Contract). It renders its own bare <html><body> outside ThemeProvider
// and without globals.css, so it resolves the theme through the shared reader
// and picks warm Má Tư Design System values for either mode (never neutral greys).
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [mode, setMode] = useState<ThemeMode>("light");
  useEffect(() => {
    setMode(resolveClientThemeMode());
  }, []);

  const colors = GLOBAL_ERROR_PALETTE[mode];

  return (
    <html lang="vi">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          background: colors.background,
          color: colors.foreground,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            {ERRORS_VI.serverError}
          </h1>
          <p style={{ color: colors.muted, marginTop: "0.5rem" }}>
            {ERRORS_VI.fallback}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              minHeight: "44px",
              padding: "0.5rem 1.25rem",
              border: `1px solid ${colors.border}`,
              borderRadius: "0.5rem",
              background: colors.surface,
              color: colors.foreground,
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {ACTIONS_VI.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
