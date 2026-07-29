"use client";

import { usePathname } from "next/navigation";
import { createBranchOpsChannel } from "@/_hooks/use-branch-ops-events";
import { useRealtimeRefresh } from "@/_hooks/use-realtime-refresh";

export function BranchOpsRefresh({
  branchId,
  disabledPathPrefixes = [],
}: {
  branchId: number;
  disabledPathPrefixes?: readonly string[];
}) {
  const pathname = usePathname();
  const enabled = disabledPathPrefixes.every(
    (prefix) => pathname !== prefix && !pathname?.startsWith(`${prefix}/`),
  );

  useRealtimeRefresh({
    deps: [branchId],
    enabled,
    pollMs: false,
    setupChannel: (supabase, scheduleRefresh, token) =>
      createBranchOpsChannel(supabase, branchId, scheduleRefresh, token),
  });

  return null;
}
