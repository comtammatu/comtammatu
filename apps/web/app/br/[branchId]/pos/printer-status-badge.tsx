"use client";

import { useEffect, useState } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { createClient } from "@comtammatu/database/supabase/client";
import { IconPrinter, IconPrinterOff } from "@tabler/icons-react";

interface PrinterStatusBadgeProps {
  branchId: number;
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

export function PrinterStatusBadge({ branchId }: PrinterStatusBadgeProps) {
  const [status, setStatus] = useState<AgentStatus>({
    agentId: null,
    lastSeenAt: null,
    isOnline: false,
    hasAgent: false,
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const fetchStatus = async () => {
      const { data } = await supabase
        .from("printer_agent_status")
        .select("agent_id, last_seen_at")
        .eq("branch_id", branchId)
        .maybeSingle();
      if (cancelled) return;
      setStatus(
        computeStatus(
          (data?.agent_id as string | undefined) ?? null,
          (data?.last_seen_at as string | undefined) ?? null,
        ),
      );
    };

    void fetchStatus();
    const pollId = setInterval(() => void fetchStatus(), POLL_INTERVAL_MS);

    const channel = supabase
      .channel(`printer_agents:branch=${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "printer_agents",
          filter: `branch_id=eq.${branchId}`,
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
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [branchId]);

  if (!status.hasAgent) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-muted-foreground"
        title="Chưa có print-agent nào kết nối cho chi nhánh này"
      >
        <IconPrinter className="size-3.5" />
        <span className="hidden sm:inline">Máy in: chưa đăng ký</span>
        <span className="sm:hidden">Chưa có</span>
      </Badge>
    );
  }

  if (status.isOnline) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-success/40 text-success"
        title={`Agent ${status.agentId ?? ""} — online`}
      >
        <IconPrinter className="size-3.5" />
        <span className="hidden sm:inline">Máy in: online</span>
        <span className="sm:hidden">Online</span>
      </Badge>
    );
  }

  return (
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
}
