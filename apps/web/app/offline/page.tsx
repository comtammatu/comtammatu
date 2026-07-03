"use client";

import { WifiOff as IconWifiOff } from "lucide-react";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState, AppPage } from "@/components/surface";

// Precached Serwist navigation fallback for the Branch Operator Hub (see
// hubOfflineFallback in app/sw.ts) — served only when a Hub navigation fails
// offline, never as a substitute for a real page while online.
export default function OfflinePage() {
  return (
    <div
      id="main-content"
      role="main"
      className="flex min-h-dvh w-full items-center justify-center"
    >
      <AppPage mobile contentClassName="max-w-xl">
        <AppEmptyState
          mode="error"
          icon={<IconWifiOff />}
          title={ERRORS_VI.networkError}
          description={ERRORS_VI.loadFailed}
        >
          <Button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            {ACTIONS_VI.retry}
          </Button>
        </AppEmptyState>
      </AppPage>
    </div>
  );
}
