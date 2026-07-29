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
    (supabase: SupabaseClient, token: string | null) => {
      if (!enabled || branchId === null) return null;
      return createBranchOpsChannel(supabase, branchId, onEvent, token);
    },
    [branchId, enabled, onEvent],
  );

  useRealtimeChannel(setupChannel, [setupChannel]);
}
