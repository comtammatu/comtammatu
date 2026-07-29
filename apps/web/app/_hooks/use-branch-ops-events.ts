"use client";

import { useCallback } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  canSubscribeBranchOpsTopic,
  extractClaimsFromAccessToken,
} from "@comtammatu/shared/auth";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";

export function createBranchOpsChannel(
  supabase: SupabaseClient,
  branchId: number,
  onEvent: () => void,
  token: string | null,
): RealtimeChannel | null {
  const claims = extractClaimsFromAccessToken(token);
  if (!claims || !canSubscribeBranchOpsTopic(claims, branchId)) {
    return null;
  }

  let initialSubscribe = true;
  const channel = supabase.channel(`branch:${String(branchId)}:ops`, {
    config: { broadcast: { self: false }, private: true },
  });
  channel.on("broadcast", { event: "ops" }, () => onEvent());
  channel.subscribe((status, err) => {
    if (status === "CHANNEL_ERROR") {
      // A terminal authorization reject (RLS denied read on realtime.messages)
      // leaves Phoenix's rejoinTimer armed, so the client re-JOINs forever and
      // floods the broker with Unauthorized. removeChannel tears the channel
      // down and resets the timer. Transport errors stay retryable.
      const text = `${err?.message ?? ""} ${
        err?.cause ? JSON.stringify(err.cause) : ""
      }`;
      if (/unauthorized|permission|denied/i.test(text)) {
        void supabase.removeChannel(channel);
      }
      return;
    }
    if (status === "SUBSCRIBED") {
      if (initialSubscribe) {
        initialSubscribe = false;
        return;
      }
      onEvent();
    }
  });
  return channel;
}

export function useBranchOpsEvents({
  branchId,
  enabled = true,
  onEvent,
}: {
  branchId: number | null;
  enabled?: boolean;
  onEvent: () => void;
}) {
  const setupChannel = useCallback(
    (supabase: SupabaseClient, token: string | null) => {
      if (!enabled || branchId === null) return null;
      return createBranchOpsChannel(supabase, branchId, onEvent, token);
    },
    [branchId, enabled, onEvent],
  );

  useRealtimeChannel(setupChannel, [setupChannel]);
}
