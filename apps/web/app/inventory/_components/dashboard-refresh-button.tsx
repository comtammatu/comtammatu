"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { RefreshCw as IconRefresh } from "lucide-react";
import { refreshDashboardMv } from "../dashboard-actions";

const CLIENT_COOLDOWN_MS = 60_000;

interface DashboardRefreshButtonProps {
  /** ISO timestamp from get_inventory_dashboard.computed_at — server authoritative. */
  computedAt: string;
  /** Whether user has refresh permission. Hidden if false. */
  canRefresh?: boolean;
  className?: string;
}

/**
 * Manual MV refresh button (S12).
 *
 * Shows "Cập nhật lúc HH:mm:ss" next to button — timestamp comes from
 * the server's get_inventory_dashboard response (authoritative clock).
 *
 * Client-side 60s cooldown prevents spamming while the server-side pg_cron
 * refreshes every 5 min regardless.
 */
export function DashboardRefreshButton({
  computedAt,
  canRefresh = true,
  className,
}: DashboardRefreshButtonProps) {
  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = useState<number>(0);
  const [isRefreshing, startRefresh] = useTransition();

  if (!canRefresh) return null;

  const cooldownRemaining = Math.max(
    0,
    CLIENT_COOLDOWN_MS - (Date.now() - lastRefreshed),
  );
  const onCooldown = cooldownRemaining > 0;

  function handleRefresh() {
    if (onCooldown) {
      toast.info(
        `Vui lòng đợi ${Math.ceil(cooldownRemaining / 1000)}s trước khi refresh lại`,
      );
      return;
    }
    startRefresh(async () => {
      const res = await refreshDashboardMv();
      if (!res.success) {
        toast.error(res.error ?? "Không refresh được");
        return;
      }
      setLastRefreshed(Date.now());
      toast.success("Đã refresh dashboard");
      router.refresh();
    });
  }

  const computedTime = safeTime(computedAt);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {computedTime ? (
        <span className="text-xs text-muted-foreground">
          Cập nhật lúc: <span className="font-medium">{computedTime}</span>
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={isRefreshing || onCooldown}
      >
        {isRefreshing ? (
          <Spinner />
        ) : (
          <IconRefresh className="size-4" />
        )}
        Làm mới
      </Button>
    </div>
  );
}

function safeTime(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
}
