"use client";

import { useEffect, useRef } from "react";
import {
  subscribeBranchOps,
  type BranchOpsEventFilter,
} from "./branch-ops-runtime";

export { createBranchOpsChannel } from "./branch-ops-runtime";

export function useBranchOpsEvents({
  branchId,
  enabled = true,
  filter,
  onEvent,
}: {
  branchId: number | null;
  enabled?: boolean;
  filter?: BranchOpsEventFilter;
  onEvent: () => void;
}) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const domainsKey = filter?.domains?.join("\u0000") ?? "";
  const tablesKey = filter?.tables?.join("\u0000") ?? "";

  useEffect(() => {
    if (!enabled || branchId === null) return;
    return subscribeBranchOps({
      branchId,
      filter: {
        domains: domainsKey ? domainsKey.split("\u0000") : undefined,
        tables: tablesKey ? tablesKey.split("\u0000") : undefined,
      },
      onInvalidate: () => onEventRef.current(),
    });
  }, [branchId, domainsKey, enabled, tablesKey]);
}
