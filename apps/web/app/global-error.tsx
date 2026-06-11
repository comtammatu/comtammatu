"use client";

import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            {ERRORS_VI.serverError}
          </h1>
          <p style={{ color: "#555", marginTop: "0.5rem" }}>
            {ERRORS_VI.fallback}
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#888",
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
              border: "1px solid #ccc",
              borderRadius: "0.5rem",
              background: "#fff",
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
