"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui/lib/utils";
import { messages } from "@lib/messages";
import { formatVNTime } from "@/_lib/format-datetime";
import { refreshMaterializedViews } from "../actions";

const stalenessCopy = messages.finance.staleness;

// Tells the owner how fresh the displayed numbers are and offers a
// manual refresh. The MV refresh job runs on a cron (see migration
// 20260425030044_cron_refresh_finance_views.sql); this banner exposes
// the latest run timestamp + a forced-refresh button for owner peace of
// mind during peak hours.
//
// Architect §3 risk #5: refresh button + realtime hook share a debounced
// transition — clicking refresh while a payment lands should NOT trigger
// concurrent router.refresh storms. We rely on useTransition + disabled
// state to gate the button while pending.

interface MvStalenessBannerProps {
  /** ISO timestamp of the last successful MV refresh, or null if unknown */
  lastRefreshAt: string | null;
  className?: string;
  canRefresh: boolean;
}

const STALE_MINUTES_WARNING = 10;

function diffMinutes(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

function formatTimestamp(iso: string): string {
  return formatVNTime(iso);
}

export function MvStalenessBanner({
  lastRefreshAt,
  className,
  canRefresh,
}: MvStalenessBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const minutes = lastRefreshAt ? diffMinutes(lastRefreshAt) : null;
  const stale = minutes != null && minutes >= STALE_MINUTES_WARNING;
  const tone = stale ? "warning" : "muted";

  const messageWhen = lastRefreshAt
    ? minutes === 0
      ? stalenessCopy.fresh(formatTimestamp(lastRefreshAt))
      : stalenessCopy.minutesAgo(minutes ?? 0, formatTimestamp(lastRefreshAt))
    : stalenessCopy.unknown;

  function handleRefresh() {
    if (isPending) return;
    startTransition(async () => {
      const res = await refreshMaterializedViews();
      if (res.success) {
        router.refresh();
      }
      // Silent fail: existing UX pattern in revenue-client — owner can
      // see staleness persists, no toast clutter.
    });
  }

  return (
    <NoteCallout
      tone={tone === "warning" ? "warning" : "muted"}
      className={cn("py-1.5 text-xs", className)}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={tone === "warning" ? undefined : "text-muted-foreground"}>
          {messageWhen}
        </span>
        {canRefresh ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isPending}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            {isPending ? (
              <Spinner className="size-3.5" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            {isPending ? stalenessCopy.refreshing : stalenessCopy.refresh}
          </Button>
        ) : null}
      </div>
    </NoteCallout>
  );
}
