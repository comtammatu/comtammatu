"use client";

import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";

export type ErrorPanelProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * Opt-in re-authentication escape hatch. Only app-wide boundaries may enable
   * it; station boundaries (POS, KDS, runner, operator) must keep retry alone
   * so a mis-tap cannot end the shift session mid-service.
   */
  allowSignOut?: boolean;
};

export function ErrorPanel({ reset, allowSignOut = false }: ErrorPanelProps) {
  return (
    <AppEmptyState mode="error" description={ERRORS_VI.fallback}>
      <Button size="touch" onClick={reset}>
        {ACTIONS_VI.retry}
      </Button>
      {allowSignOut ? (
        <form action="/api/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            {ACTIONS_VI.signInAgain}
          </Button>
        </form>
      ) : null}
    </AppEmptyState>
  );
}
