"use client";

import { ErrorPanel, type ErrorPanelProps } from "@/components/error-panel";

export default function RootError({ error, reset }: ErrorPanelProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <ErrorPanel error={error} reset={reset} />
      </div>
    </main>
  );
}
