"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui/lib/utils";
import { messages } from "@lib/messages";
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
}

const STALE_MINUTES_WARNING = 10;

function diffMinutes(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function MvStalenessBanner({
  lastRefreshAt,
  className,
}: MvStalenessBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const minutes = lastRefreshAt ? diffMinutes(lastRefreshAt) : null;
  const stale = minutes != null && minutes >= STALE_MINUTES_WARNING;
  const tone = stale ? "warning" : "muted";

  const messageWhen = lastRefreshAt
    ? minutes === 0
      ? stalenessCopy.fresh(formatTimestamp(lastRefreshAt))
      : stalenessCopy.minutesAgo(
          minutes ?? 0,
          formatTimestamp(lastRefreshAt),
        )
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
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs",
        tone === "warning"
          ? "border-warning/30 bg-warning/5 text-warning-foreground"
          : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span>{messageWhen}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRefresh}
        disabled={isPending}
        className="h-7 gap-1.5 px-2 text-xs"
      >
        <RefreshCw
          className={cn("size-3.5", isPending && "animate-spin")}
          aria-hidden
        />
        {isPending ? stalenessCopy.refreshing : stalenessCopy.refresh}
      </Button>
    </div>
  );
}
