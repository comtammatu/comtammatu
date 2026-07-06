"use client";

import { useCallback, useEffect, useRef, type DependencyList } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";

const REFRESH_DEBOUNCE_MS = 2500;
const MIN_REFRESH_INTERVAL_MS = 15000;
const AUTO_REFRESH_MS = 60000;

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
  ) => RealtimeChannel | null;
  /** Re-subscribe when any of these change (e.g. [branchId]). */
  deps: DependencyList;
  enabled?: boolean;
}

/**
 * Realtime-driven `router.refresh()` for RSC surfaces: subscribe to a channel,
 * coalesce its events into a debounced + rate-limited refresh, and keep a
 * visibility-aware 60s poll as a fallback for a dropped socket. The transport
 * (postgres_changes vs broadcast) is caller-supplied via `setupChannel`.
 */
export function useRealtimeRefresh({
  setupChannel,
  deps,
  enabled = true,
}: UseRealtimeRefreshOptions): void {
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
      router.refresh();
    }, waitMs);
  }, [enabled, router]);

  useRealtimeChannel(
    (supabase, token) => {
      if (!enabled) return null;
      return setupChannel(supabase, scheduleRefresh, token);
    },
    // Caller's `deps` drive re-subscribe (e.g. [branchId]); enabled/scheduleRefresh
    // added so toggling off or a router change re-wires the channel.
    [...deps, enabled, scheduleRefresh],
  );

  useEffect(() => {
    if (!enabled) return;

    // Pause polling when the tab is hidden. Mobile CPUs throttle background
    // tabs; refreshing while hidden does nothing useful and stacks work for
    // the return. On resume we catch up exactly once if a beat was missed.
    let lastRefreshAt = Date.now();
    let interval: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (document.visibilityState !== "visible") return;
      lastRefreshAt = Date.now();
      scheduleRefresh();
    }

    function startInterval() {
      if (interval !== null) return;
      interval = setInterval(tick, AUTO_REFRESH_MS);
    }
    function stopInterval() {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastRefreshAt >= AUTO_REFRESH_MS) {
          lastRefreshAt = Date.now();
          scheduleRefresh();
        }
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
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, scheduleRefresh]);
}
