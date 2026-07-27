"use client";

import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";

export type ErrorPanelProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function ErrorPanel({ reset }: ErrorPanelProps) {
  return (
    <AppEmptyState mode="error" description={ERRORS_VI.fallback}>
      <Button onClick={reset}>{ACTIONS_VI.retry}</Button>
    </AppEmptyState>
  );
}
