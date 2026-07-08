"use client";

import { useEffect, useState } from "react";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";

// global-error.tsx is the named inline-style exception (design-system.md
// § Token Contract). It renders its own bare <html><body> outside ThemeProvider,
// so it resolves the `matu-theme` cookie itself and picks warm Concept-01
// values for either mode (never neutral greys).
type Mode = "light" | "night";

const PALETTE = {
  light: {
    background: "#fff6ee",
    foreground: "#1a2238",
    muted: "#6b5b47",
    border: "#e8dcc8",
    surface: "#ffffff",
  },
  night: {
    background: "#1f1812",
    foreground: "#f5ebd9",
    muted: "#c9b896",
    border: "#3a2f24",
    surface: "#2a2218",
  },
} as const;

function readMode(): Mode {
  if (typeof document === "undefined") return "light";
  const match = document.cookie.match(/(^|;)\s*matu-theme\s*=\s*([^;]+)/);
  const value = match
    ? decodeURIComponent(match.pop()!.split("=").pop()!)
    : "";
  if (value === "light" || value === "night") return value;
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? "night" : "light";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [mode, setMode] = useState<Mode>("light");
  useEffect(() => {
    setMode(readMode());
  }, []);

  const colors = PALETTE[mode];

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
          {error.digest ? (
            <p
              style={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: colors.muted,
                marginTop: "0.5rem",
              }}
            >
              {ERRORS_VI.errorCode}: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
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
