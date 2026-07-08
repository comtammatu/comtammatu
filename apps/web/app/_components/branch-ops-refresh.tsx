"use client";

import { createBranchOpsChannel } from "@/_hooks/use-branch-ops-events";
import { useRealtimeRefresh } from "@/_hooks/use-realtime-refresh";

export function BranchOpsRefresh({ branchId }: { branchId: number }) {
  useRealtimeRefresh({
    deps: [branchId],
    setupChannel: (supabase, scheduleRefresh) =>
      createBranchOpsChannel(supabase, branchId, scheduleRefresh),
  });

  return null;
}
