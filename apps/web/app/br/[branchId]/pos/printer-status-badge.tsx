"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { createClient } from "@comtammatu/database/supabase/client";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
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

  // Fetch + 30s poll. Stays separate from the realtime channel so the
  // helper can own the auth-await dance. Uses its own short-lived
  // Supabase client (matches existing pattern; both clients share
  // supabase-js's underlying connection pool internally).
  const fetchStatus = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("printer_agent_status")
      .select("agent_id, last_seen_at")
      .eq("branch_id", branchId)
      .maybeSingle();
    setStatus(
      computeStatus(
        (data?.agent_id as string | undefined) ?? null,
        (data?.last_seen_at as string | undefined) ?? null,
      ),
    );
  }, [branchId]);

  const fetchStatusRef = useRef(fetchStatus);
  useEffect(() => {
    fetchStatusRef.current = fetchStatus;
  }, [fetchStatus]);

  useEffect(() => {
    void fetchStatus();
    const pollId = setInterval(() => {
      // Skip the polled fetch when the tab is hidden — wasted work on
      // backgrounded iPads / sleeping tabs. The realtime channel above
      // still pushes UPDATE/INSERT events when a row changes; on resume
      // the visibility-change handler below catches up immediately.
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

  const initialSubscribeSeenRef = useRef(false);

  useRealtimeChannel(
    (supabase) =>
      supabase
        .channel(`printer_agents:branch=${String(branchId)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "printer_agents",
            filter: `branch_id=eq.${String(branchId)}`,
          },
          (payload) => {
            const row = payload.new as {
              agent_id?: string;
              last_seen_at?: string;
            } | null;
            if (!row) return;
            setStatus(
              computeStatus(row.agent_id ?? null, row.last_seen_at ?? null),
            );
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          // Skip the FIRST SUBSCRIBED — fetchStatus() ran on mount above.
          // Every SUBSCRIBED after that is a reconnect: refetch so the
          // badge reflects any agent state change that fired during the
          // WS disconnect window (otherwise we'd wait up to POLL_INTERVAL_MS).
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            return;
          }
          void fetchStatusRef.current();
        }),
    [branchId],
  );

  const badge = !status.hasAgent ? (
    <Badge
      variant="outline"
      className="gap-1 text-muted-foreground"
      title="Chưa có print-agent nào kết nối cho chi nhánh này"
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
