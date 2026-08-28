"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { createClient } from "@comtammatu/database/supabase/client";
import { POS_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  Printer as IconPrinter,
  PrinterX as IconPrinterOff,
} from "lucide-react";
import {
  PrinterStatusSheet,
  type AgentStatus,
} from "./_components/printer-status-sheet";

interface PrinterStatusIndicatorProps {
  branchId: number;
  settingsHref?: string;
}

const OFFLINE_THRESHOLD_MS = 60_000;
const POLL_INTERVAL_MS = 30_000;

const FAILED_BADGE_COPY = {
  title: (count: number) => `${String(count)} lệnh in lỗi trong 24 giờ qua`,
  long: (count: number) => `Máy in: ${String(count)} lỗi`,
  short: (count: number) => `${String(count)} lỗi`,
};

function computeStatus(
  agentId: string | null,
  lastSeenAt: string | null,
): AgentStatus {
  if (!lastSeenAt) {
    return { agentId, lastSeenAt, isOnline: false, hasAgent: false };
  }
  const age = Date.now() - new Date(lastSeenAt).getTime();
  return {
    agentId,
    lastSeenAt,
    isOnline: age < OFFLINE_THRESHOLD_MS,
    hasAgent: true,
  };
}

export function PrinterStatusIndicator({
  branchId,
  settingsHref,
}: PrinterStatusIndicatorProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [status, setStatus] = useState<AgentStatus>({
    agentId: null,
    lastSeenAt: null,
    isOnline: false,
    hasAgent: false,
  });
  const [failedCount, setFailedCount] = useState(0);

  // Fetch + 30s poll. printer_agents is intentionally NOT in the realtime
  // publication (its 30s heartbeat would fan out per-row RLS WAL work to every
  // POS tab); the poll + visibility-resume refetch below is the freshness path,
  // and the heartbeat cadence is itself 30s so push would add no freshness.
  const fetchStatus = useCallback(async () => {
    const supabase = createClient();
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [statusRes, failedRes] = await Promise.all([
      supabase
        .from("printer_agent_status")
        .select("agent_id, last_seen_at")
        .eq("branch_id", branchId)
        .maybeSingle(),
      supabase
        .from("print_jobs")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .in("status", ["failed", "expired"])
        .gte("created_at", sinceIso),
    ]);
    setStatus(
      computeStatus(
        (statusRes.data?.agent_id as string | undefined) ?? null,
        (statusRes.data?.last_seen_at as string | undefined) ?? null,
      ),
    );
    setFailedCount(failedRes.count ?? 0);
  }, [branchId]);

  const fetchStatusRef = useRef(fetchStatus);
  useEffect(() => {
    fetchStatusRef.current = fetchStatus;
  }, [fetchStatus]);

  useEffect(() => {
    void fetchStatus();
    const pollId = setInterval(() => {
      // Skip the polled fetch when the tab is hidden — wasted work on
      // backgrounded iPads / sleeping tabs. The visibility-change handler
      // below catches up immediately on resume.
      if (document.visibilityState === "hidden") return;
      void fetchStatusRef.current();
    }, POLL_INTERVAL_MS);

    // Resume catch-up so a stale "online" badge doesn't survive the
    // first 30s after the cashier returns. Cheap (single maybeSingle).
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchStatusRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchStatus]);

  // A failed job outranks the heartbeat tone: agent online + dead printer
  // looked healthy before — the count is the actual paper-out-of-tray truth.
  const offlineTitle = `Dịch vụ in ${status.agentId ?? ""} mất kết nối lần cuối ${formatVNDateTime(status.lastSeenAt)}`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        className="relative shrink-0"
        onClick={() => setSheetOpen(true)}
        aria-label={
          failedCount > 0
            ? FAILED_BADGE_COPY.title(failedCount)
            : !status.hasAgent
              ? POS_VI.printerNoneTitle
              : status.isOnline
                ? `Máy in đang kết nối (${status.agentId ?? "Dịch vụ in"})`
                : offlineTitle
        }
        title={
          failedCount > 0
            ? FAILED_BADGE_COPY.title(failedCount)
            : !status.hasAgent
              ? POS_VI.printerNoneTitle
              : status.isOnline
                ? `Máy in đang kết nối (${status.agentId ?? "Dịch vụ in"})`
                : offlineTitle
        }
      >
        {failedCount > 0 ? (
          <>
            <IconPrinterOff className="size-5 text-destructive" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-2xs font-semibold text-destructive-foreground tabular-nums">
              {failedCount > 9 ? "9+" : failedCount}
            </span>
          </>
        ) : !status.hasAgent ? (
          <IconPrinter className="size-5 text-muted-foreground" />
        ) : status.isOnline ? (
          <IconPrinter className="size-5 text-success" />
        ) : (
          <IconPrinterOff className="size-5 text-destructive" />
        )}
      </Button>

      <PrinterStatusSheet
        branchId={branchId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        status={status}
        onRefresh={() => void fetchStatus()}
        settingsHref={settingsHref ?? `/br/${branchId}/settings/printers`}
      />
    </>
  );
}
