"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  ControlSurfaceScopeControl,
} from "@/components/control-surface-scope-control";
import {
  type ControlSurfaceBranchScope,
} from "@/lib/control-surface-scope";
import type { InventoryBranchOption } from "../_lib/inventory-scope";
import { inventoryPathSupportsAggregateScope } from "../_lib/inventory-scope-paths";

interface InventoryBranchFilterProps {
  branches: InventoryBranchOption[];
  defaultBranchId: number | null;
  canSelectAll?: boolean;
}

/**
 * Inventory Phạm vi chrome — writes unified `?branch=` only.
 */
export function InventoryBranchFilter({
  branches,
  defaultBranchId,
  canSelectAll = false,
}: InventoryBranchFilterProps) {
  const pathname = usePathname();
  const allowedIds = useMemo(
    () => branches.map((branch) => branch.id),
    [branches],
  );

  const supportsAggregate = inventoryPathSupportsAggregateScope(pathname ?? "");

  const fallback = useMemo((): ControlSurfaceBranchScope => {
    if (canSelectAll && supportsAggregate) return "all";
    if (defaultBranchId != null) {
      return String(defaultBranchId) as `${number}`;
    }
    return "all";
  }, [canSelectAll, defaultBranchId, supportsAggregate]);

  // Non-tenant roles must never stay on aggregate `all` from a stale URL.
  const effectiveFallback = useMemo((): ControlSurfaceBranchScope => {
    if (canSelectAll && supportsAggregate) return fallback;
    if (defaultBranchId != null) {
      return String(defaultBranchId) as `${number}`;
    }
    return fallback;
  }, [canSelectAll, supportsAggregate, fallback, defaultBranchId]);

  if (branches.length <= 1 && !canSelectAll) return null;

  return (
    <ControlSurfaceScopeControl
      sites={branches}
      aggregates={canSelectAll && supportsAggregate ? ["all"] : []}
      fallback={effectiveFallback}
      allowedIds={allowedIds}
    />
  );
}
