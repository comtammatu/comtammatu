"use client";

import { useEffect } from "react";

type LockStateKind =
  | "idle"
  | "acquiring"
  | "held"
  | "blocked"
  | "lost"
  | "error";

interface ZoneLockIndicatorProps {
  sessionId: number;
  zoneId: string;
  ttlSeconds?: number;
  heartbeatMs?: number;
  onLost?: () => void;
  onStateChange?: (state: LockStateKind) => void;
  className?: string;
}

/**
 * Stocktake zone-lock indicator.
 *
 * HKD lean baseline: the server-side zone-lock RPCs are out of scope (single
 * counter per session), so this component no longer acquires or heartbeats a
 * lock. It keeps the prop contract stable and reports a permanent "held" state
 * so the counting UI behaves as if the current user owns the zone.
 */
export function ZoneLockIndicator({ onStateChange }: ZoneLockIndicatorProps) {
  useEffect(() => {
    onStateChange?.("held");
  }, [onStateChange]);

  return null;
}
