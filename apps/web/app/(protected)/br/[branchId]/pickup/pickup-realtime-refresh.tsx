"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/client";
import {
  evictRealtimeChannel,
  stopRealtimeAuthorizationRejoin,
} from "@/_hooks/use-realtime-channel";
import {
  REALTIME_SAFETY_POLL_MS,
  realtimeHealthFromStatus,
  shouldRunRealtimeFallback,
  type RealtimeChannelHealth,
} from "@/_utils/realtime-health";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";

// Pickup is a derived queue, so a relevant event still requires a full rebuild.
// Keep the former 6-second freshness bound only while Realtime is unavailable;
// healthy channels use a low-frequency safety refresh instead.
const PICKUP_DEGRADED_POLL_MS = 6_000;

export function PickupRealtimeRefresh({ branchId }: { branchId: number }) {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (supabaseRef.current === null) {
    supabaseRef.current = createClient();
  }
  const channelHealthRef = useRef<RealtimeChannelHealth>("connecting");
  const lastRefreshSignalAtRef = useRef(Date.now());
  const initialSubscribeSeenRef = useRef(false);
  const refresh = useMemo(
    () =>
      makeRealtimeCoalescer(
        async () => {
          router.refresh();
        },
        undefined,
        {
          metricName: "pickup.board.refresh",
          minIntervalMs: PICKUP_DEGRADED_POLL_MS,
        },
      ),
    [router],
  );

  const signalRefresh = useCallback(() => {
    lastRefreshSignalAtRef.current = Date.now();
    refresh();
  }, [refresh]);
  const signalRefreshRef = useRef(signalRefresh);
  signalRefreshRef.current = signalRefresh;

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (supabase === null) return;

    channelHealthRef.current = "connecting";
    lastRefreshSignalAtRef.current = Date.now();
    initialSubscribeSeenRef.current = false;

    const channelName = `pickup:${branchId}`;
    const topic = `realtime:${channelName}`;
    for (const existing of supabase.realtime.getChannels()) {
      if (existing.topic === topic) {
        evictRealtimeChannel(supabase, existing);
      }
    }

    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false }, private: false },
    });
    channel.on("broadcast", { event: "invalidate" }, () => {
      signalRefreshRef.current();
    });
    channel.subscribe((status, error) => {
      const health = realtimeHealthFromStatus(status);
      if (health !== null) channelHealthRef.current = health;

      if (
        status === "CHANNEL_ERROR" &&
        stopRealtimeAuthorizationRejoin(supabase, channel, error)
      ) {
        return;
      }
      if (status !== "SUBSCRIBED") return;
      if (initialSubscribeSeenRef.current) signalRefreshRef.current();
      initialSubscribeSeenRef.current = true;
    });

    return () => {
      evictRealtimeChannel(supabase, channel);
    };
  }, [branchId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (
        !shouldRunRealtimeFallback(
          channelHealthRef.current,
          now - lastRefreshSignalAtRef.current,
          {
            degradedPollMs: PICKUP_DEGRADED_POLL_MS,
            safetyPollMs: REALTIME_SAFETY_POLL_MS,
          },
        )
      ) {
        return;
      }

      lastRefreshSignalAtRef.current = now;
      refresh();
    }, PICKUP_DEGRADED_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") signalRefresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [signalRefresh]);

  return null;
}
