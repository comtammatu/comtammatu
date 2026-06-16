"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { createClient } from "@comtammatu/database/supabase/client";
import {
  Printer as IconPrinter,
  PrinterX as IconPrinterOff,
} from "lucide-react";

interface PrinterStatusBadgeProps {
  branchId: number;
  settingsHref?: string;
}

type AgentStatus = {
  agentId: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  hasAgent: boolean;
};

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

export function PrinterStatusBadge({
  branchId,
  settingsHref,
}: PrinterStatusBadgeProps) {
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
  const badge = failedCount > 0 ? (
    <Badge
      variant="outline"
      className="gap-1 border-destructive/40 text-destructive"
      title={FAILED_BADGE_COPY.title(failedCount)}
    >
      <IconPrinterOff className="size-3.5" />
      <span className="hidden sm:inline">
        {FAILED_BADGE_COPY.long(failedCount)}
      </span>
      <span className="sm:hidden">{FAILED_BADGE_COPY.short(failedCount)}</span>
    </Badge>
  ) : !status.hasAgent ? (
    <Badge
      variant="outline"
      className="gap-1 text-muted-foreground"
      title="Chưa có máy in nào kết nối cho chi nhánh này"
    >
      <IconPrinter className="size-3.5" />
      <span className="hidden sm:inline">Máy in: chưa đăng ký</span>
      <span className="sm:hidden">Chưa có</span>
    </Badge>
  ) : status.isOnline ? (
    <Badge
      variant="outline"
      className="gap-1 border-success/40 text-success"
      title={`Agent ${status.agentId ?? ""} — online`}
    >
      <IconPrinter className="size-3.5" />
      <span className="hidden sm:inline">Máy in: online</span>
      <span className="sm:hidden">Online</span>
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1 border-destructive/40 text-destructive"
      title={`Agent ${status.agentId ?? ""} offline lần cuối ${status.lastSeenAt ?? ""}`}
    >
      <IconPrinterOff className="size-3.5" />
      <span className="hidden sm:inline">Máy in: offline</span>
      <span className="sm:hidden">Offline</span>
    </Badge>
  );

  if (settingsHref) {
    return (
      <Link
        href={settingsHref}
        className="inline-flex hover:opacity-80"
        title="Cấu hình máy in của chi nhánh"
      >
        {badge}
      </Link>
    );
  }

  return badge;
}
