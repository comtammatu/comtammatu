"use client";

import { useCallback } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";

export function createBranchOpsChannel(
  supabase: SupabaseClient,
  branchId: number,
  onEvent: () => void,
): RealtimeChannel {
  let initialSubscribe = true;
  return supabase
    .channel(`branch:${String(branchId)}:ops`, {
      config: { broadcast: { self: false }, private: true },
    })
    .on("broadcast", { event: "ops" }, () => onEvent())
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (initialSubscribe) {
          initialSubscribe = false;
          return;
        }
        onEvent();
      }
    });
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
    (supabase: SupabaseClient) => {
      if (!enabled || branchId === null) return null;
      return createBranchOpsChannel(supabase, branchId, onEvent);
    },
    [branchId, enabled, onEvent],
  );

  useRealtimeChannel(setupChannel, [setupChannel]);
}
