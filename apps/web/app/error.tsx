"use client";

import { ErrorPanel, type ErrorPanelProps } from "@/components/error-panel";

export default function RootError({ error, reset }: ErrorPanelProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center p-4"
    >
      <div className="w-full max-w-xl">
        <ErrorPanel error={error} reset={reset} />
      </div>
    </main>
  );
}
