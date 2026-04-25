"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Lock as IconLock, LockOpen as IconLockOpen, TriangleAlert as IconAlertTriangle, RefreshCw as IconRefresh } from "lucide-react";
import {
  acquireZoneLock,
  heartbeatZoneLock,
  releaseZoneLock,
} from "../stocktake-actions";

interface ZoneLockIndicatorProps {
  sessionId: number;
  zoneId: string;
  /** TTL for the acquire call. Default 30min (server default). */
  ttlSeconds?: number;
  /** Heartbeat cadence — default 1/3 of TTL so we refresh 3× per window. */
  heartbeatMs?: number;
  /** Called when lock is lost (another user took it / expired). */
  onLost?: () => void;
  onStateChange?: (state: LockState["kind"]) => void;
  className?: string;
}

type LockState =
  | { kind: "idle" }
  | { kind: "acquiring" }
  | { kind: "held"; expiresAt: string; lockedBy: string }
  | { kind: "blocked"; lockedBy: string }
  | { kind: "lost" }
  | { kind: "error"; message: string };

/**
 * Stocktake zone-lock lifecycle UX (S13a).
 *
 * On mount: acquires lock via `acquire_zone_lock` RPC.
 * Every `heartbeatMs`: extends TTL via `heartbeat_zone_lock` — if server
 * says "lost ownership" the indicator flips to `blocked` and fires `onLost`.
 * On unmount: releases lock so next counter can pick up.
 *
 * Renders:
 *   - Lock icon + holder
 *   - Countdown to expiry
 *   - "Refresh lock" button to force-heartbeat
 */
export function ZoneLockIndicator({
  sessionId,
  zoneId,
  ttlSeconds = 1800,
  heartbeatMs,
  onLost,
  onStateChange,
  className,
}: ZoneLockIndicatorProps) {
  const effectiveHeartbeat = heartbeatMs ?? Math.floor((ttlSeconds * 1000) / 3);
  const [state, setState] = useState<LockState>({ kind: "idle" });
  const [now, setNow] = useState<number>(() => Date.now());
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const acquire = useCallback(async () => {
    setState({ kind: "acquiring" });
    const res = await acquireZoneLock(sessionId, zoneId, ttlSeconds);
    if (!res.success) {
      setState({ kind: "error", message: res.error ?? "Không acquire được lock" });
      return;
    }
    if (!res.data) {
      setState({ kind: "error", message: "Không rõ trạng thái lock" });
      return;
    }
    if (!res.data.acquired) {
      setState({ kind: "blocked", lockedBy: res.data.lockedBy });
      return;
    }
    setState({
      kind: "held",
      expiresAt: res.data.expiresAt,
      lockedBy: res.data.lockedBy,
    });
  }, [sessionId, zoneId, ttlSeconds]);

  const heartbeat = useCallback(async () => {
    const res = await heartbeatZoneLock(sessionId, zoneId, ttlSeconds);
    if (!res.success) {
      setState({ kind: "lost" });
      onLost?.();
      return;
    }
    setState((prev) =>
      prev.kind === "held"
        ? { ...prev, expiresAt: res.data?.expiresAt ?? prev.expiresAt }
        : prev,
    );
  }, [sessionId, zoneId, ttlSeconds, onLost]);

  useEffect(() => {
    onStateChange?.(state.kind);
  }, [onStateChange, state.kind]);

  // Acquire once on mount, release on unmount.
  useEffect(() => {
    void acquire();
    return () => {
      void releaseZoneLock(sessionId, zoneId);
    };
    // Intentionally only re-run on session/zone change, not acquire identity.
  }, [acquire, sessionId, zoneId]);

  // Heartbeat timer — only runs while held.
  useEffect(() => {
    if (state.kind !== "held") return;
    heartbeatTimer.current = setInterval(() => {
      void heartbeat();
    }, effectiveHeartbeat);
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, [state.kind, effectiveHeartbeat, heartbeat]);

  // 1s wall clock for countdown display.
  useEffect(() => {
    if (state.kind !== "held") return;
    clockTimer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (clockTimer.current) clearInterval(clockTimer.current);
    };
  }, [state.kind]);

  return (
    <div
      data-slot="zone-lock-indicator"
      data-kind={state.kind}
      data-zone-id={zoneId}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs",
        toneFor(state.kind),
        className,
      )}
    >
      {renderIcon(state.kind)}
      <span className="font-medium">Zone: {zoneId}</span>
      {state.kind === "held" ? (
        <>
          <Badge variant="outline" className="border-green-300 bg-white text-green-900">
            Bạn đang giữ lock
          </Badge>
          <span className="tabular-nums text-muted-foreground">
            Hết hạn sau {formatRemaining(state.expiresAt, now)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void heartbeat()}
            className="ml-auto h-7 gap-1"
          >
            <IconRefresh className="size-3.5" /> Gia hạn
          </Button>
        </>
      ) : state.kind === "blocked" ? (
        <>
          <Badge variant="outline" className="border-orange-300 bg-white text-orange-900">
            Đã có người giữ
          </Badge>
          <span className="text-muted-foreground">
            {truncateUid(state.lockedBy)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void acquire()}
            className="ml-auto h-7 gap-1"
          >
            <IconRefresh className="size-3.5" /> Thử lại
          </Button>
        </>
      ) : state.kind === "lost" ? (
        <>
          <Badge variant="destructive">Mất lock</Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void acquire()}
            className="ml-auto h-7 gap-1"
          >
            <IconRefresh className="size-3.5" /> Thử lấy lại
          </Button>
        </>
      ) : state.kind === "acquiring" ? (
        <span className="text-muted-foreground">Đang yêu cầu lock…</span>
      ) : state.kind === "error" ? (
        <>
          <Badge variant="destructive">Lỗi lock</Badge>
          <span className="text-muted-foreground">{state.message}</span>
        </>
      ) : (
        <span className="text-muted-foreground">Chưa có lock</span>
      )}
    </div>
  );
}

function toneFor(kind: LockState["kind"]): string {
  switch (kind) {
    case "held":
      return "border-green-300 bg-green-50 text-green-900";
    case "blocked":
      return "border-orange-300 bg-orange-50 text-orange-900";
    case "lost":
      return "border-red-400 bg-red-50 text-red-900";
    case "error":
      return "border-red-300 bg-red-50 text-red-900";
    case "acquiring":
      return "border-blue-300 bg-blue-50 text-blue-900";
    default:
      return "border-muted bg-muted/30 text-muted-foreground";
  }
}

function renderIcon(kind: LockState["kind"]) {
  if (kind === "held") return <IconLock className="size-4" />;
  if (kind === "blocked" || kind === "lost")
    return <IconAlertTriangle className="size-4" />;
  return <IconLockOpen className="size-4" />;
}

function formatRemaining(expiresAtIso: string, nowMs: number): string {
  const exp = new Date(expiresAtIso).getTime();
  const diff = Math.max(0, exp - nowMs);
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function truncateUid(uid: string): string {
  if (!uid) return "—";
  if (uid.length <= 10) return uid;
  return `${uid.slice(0, 6)}…${uid.slice(-4)}`;
}
