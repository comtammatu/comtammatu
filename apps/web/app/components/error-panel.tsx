"use client";

import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";

export type ErrorPanelProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function ErrorPanel({ error, reset }: ErrorPanelProps) {
  return (
    <AppEmptyState mode="error" description={ERRORS_VI.fallback}>
      <Button onClick={reset}>{ACTIONS_VI.retry}</Button>
      {error.digest ? (
        <p className="w-full text-center font-mono text-xs text-muted-foreground">
          {ERRORS_VI.errorCode}: {error.digest}
        </p>
      ) : null}
    </AppEmptyState>
  );
}
