"use client";

import { usePathname } from "next/navigation";
import { useBranchOpsEvents } from "@/_hooks/use-branch-ops-events";
import type { BranchOpsEventFilter } from "@/_hooks/branch-ops-runtime";
import { useCoalescedRouterRefresh } from "@/_hooks/use-realtime-refresh";

export function BranchOpsRefresh({
  branchId,
  disabledPathPrefixes = [],
  filter,
}: {
  branchId: number;
  disabledPathPrefixes?: readonly string[];
  filter?: BranchOpsEventFilter;
}) {
  const pathname = usePathname();
  const enabled = disabledPathPrefixes.every(
    (prefix) => pathname !== prefix && !pathname?.startsWith(`${prefix}/`),
  );

  const scheduleRefresh = useCoalescedRouterRefresh(enabled);
  useBranchOpsEvents({
    branchId,
    enabled,
    filter,
    onEvent: scheduleRefresh,
  });

  return null;
}
