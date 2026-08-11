"use client";

import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { AppEmptyState } from "@/components/surface";

export type ErrorPanelProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * Opt-in re-authentication escape hatch. Only app-wide boundaries may enable
   * it; station boundaries (POS, KDS, pickup, operator) must keep retry alone
   * so a mis-tap cannot end the shift session mid-service.
   */
  allowSignOut?: boolean;
};

export function ErrorPanel({ reset, allowSignOut = false }: ErrorPanelProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const actionSize = isTouchLayout ? "touch" : "default";
  return (
    <AppEmptyState mode="error" description={ERRORS_VI.fallback}>
      <Button size={actionSize} onClick={reset}>
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
