"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  ControlSurfaceScopeControl,
} from "@/components/control-surface-scope-control";
import {
  resolveScopeFromSearchParams,
  type ControlSurfaceBranchScope,
} from "@/lib/control-surface-scope";
import type { InventoryBranchOption } from "../_lib/inventory-scope";

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
  const searchParams = useSearchParams();
  const allowedIds = useMemo(
    () => branches.map((branch) => branch.id),
    [branches],
  );

  const fallback = useMemo((): ControlSurfaceBranchScope => {
    if (canSelectAll) return "all";
    if (defaultBranchId != null) {
      return String(defaultBranchId) as `${number}`;
    }
    return "all";
  }, [canSelectAll, defaultBranchId]);

  // Non-tenant roles must never stay on aggregate `all` from a stale URL.
  const effectiveFallback = useMemo((): ControlSurfaceBranchScope => {
    if (canSelectAll) return fallback;
    const fromUrl = resolveScopeFromSearchParams(searchParams, {
      allowedIds,
      fallback,
    });
    if (fromUrl === "all") return fallback;
    return fallback;
  }, [canSelectAll, fallback, searchParams, allowedIds]);

  if (branches.length <= 1 && !canSelectAll) return null;

  return (
    <ControlSurfaceScopeControl
      sites={branches}
      aggregates={canSelectAll ? ["all"] : []}
      fallback={effectiveFallback}
      allowedIds={allowedIds}
    />
  );
}
