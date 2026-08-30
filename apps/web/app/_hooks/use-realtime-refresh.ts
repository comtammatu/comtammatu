"use client";

import {
  useCallback,
  useEffect,
  useRef,
  startTransition,
  type DependencyList,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import {
  REALTIME_DEGRADED_POLL_MS,
  REALTIME_SAFETY_POLL_MS,
  realtimeHealthFromStatus,
  shouldRunRealtimeFallback,
  type RealtimeChannelHealth,
} from "@/_utils/realtime-health";

const REFRESH_DEBOUNCE_MS = 2500;
const MIN_REFRESH_INTERVAL_MS = 15000;
const AUTO_REFRESH_MS = REALTIME_SAFETY_POLL_MS;

/**
 * Pure function: how long to wait before firing router.refresh().
 *
 * Trailing debounce: each event resets the timer, so a burst collapses into
 * one refresh fired REFRESH_DEBOUNCE_MS after the LAST event (must-not-miss:
 * trailing edge). MIN_REFRESH_INTERVAL_MS additionally caps the rate so a
 * reconnect re-firing SUBSCRIBED can't cause rapid re-fetches.
 *
 * Exported for unit testing; not part of the public hook API.
 */
export function computeRefreshWaitMs(
  lastRefreshAt: number,
  now: number,
): number {
  const elapsed = now - lastRefreshAt;
  return Math.max(REFRESH_DEBOUNCE_MS, MIN_REFRESH_INTERVAL_MS - elapsed);
}

interface UseRealtimeRefreshOptions {
  /**
   * Build the realtime channel. Receives the auth-hot supabase client and the
   * coalesced `scheduleRefresh` trigger to wire onto the channel's events.
   * Return `null` to skip (e.g. target id not yet known). Runs once per effect
   * commit (see useRealtimeChannel's auth-gating + re-subscribe semantics).
   */
  setupChannel: (
    supabase: SupabaseClient,
    scheduleRefresh: () => void,
    token: string | null,
    reportStatus: (status: string) => void,
  ) => RealtimeChannel | null;
  /** Re-subscribe when any of these change (e.g. [branchId]). */
  deps: DependencyList;
  enabled?: boolean;
  pollMs?: number | false;
}

/**
 * Realtime-driven `router.refresh()` for RSC surfaces: subscribe to a channel,
 * coalesce its events into a debounced + rate-limited refresh, and keep a
 * health-aware fallback poll for a dropped socket plus a slow safety poll while
 * healthy. The transport (postgres_changes vs broadcast) is caller-supplied.
 */
export function useRealtimeRefresh({
  setupChannel,
  deps,
  enabled = true,
  pollMs = AUTO_REFRESH_MS,
}: UseRealtimeRefreshOptions): void {
  const scheduleRefresh = useCoalescedRouterRefresh(enabled);
  const channelHealthRef = useRef<RealtimeChannelHealth>("connecting");
  const reportStatus = useCallback((status: string) => {
    const health = realtimeHealthFromStatus(status);
    if (health !== null) channelHealthRef.current = health;
  }, []);

  useRealtimeChannel(
    (supabase, token) => {
      if (!enabled) return null;
      reportStatus("CONNECTING");
      return setupChannel(supabase, scheduleRefresh, token, reportStatus);
    },
    // Caller's `deps` drive re-subscribe (e.g. [branchId]); enabled/scheduleRefresh
    // added so toggling off or a router change re-wires the channel.
    [...deps, enabled, reportStatus, scheduleRefresh],
  );

  useEffect(() => {
    if (!enabled || pollMs === false || pollMs <= 0) return;
    const intervalMs = pollMs;

    // Pause polling when the tab is hidden. Mobile CPUs throttle background
    // tabs; refreshing while hidden does nothing useful and stacks work for
    // the return. On resume we catch up exactly once if a beat was missed.
    let lastRefreshAt = Date.now();
    let interval: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (document.visibilityState !== "visible") return;
      if (
        !shouldRunRealtimeFallback(
          channelHealthRef.current,
          Date.now() - lastRefreshAt,
          { safetyPollMs: intervalMs },
        )
      ) {
        return;
      }
      lastRefreshAt = Date.now();
      scheduleRefresh();
    }

    function startInterval() {
      if (interval !== null) return;
      interval = setInterval(tick, REALTIME_DEGRADED_POLL_MS);
    }
    function stopInterval() {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        lastRefreshAt = Date.now();
        scheduleRefresh();
        startInterval();
      } else {
        stopInterval();
      }
    }

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, pollMs, scheduleRefresh]);
}

export function useCoalescedRouterRefresh(enabled = true): () => void {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const scheduleRefresh = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    const waitMs = computeRefreshWaitMs(lastRefreshAtRef.current, Date.now());
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastRefreshAtRef.current = Date.now();
      startTransition(() => {
        router.refresh();
      });
    }, waitMs);
  }, [enabled, router]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return scheduleRefresh;
}
