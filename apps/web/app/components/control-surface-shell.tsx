"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import { InventoryBranchFilter } from "@/(protected)/inventory/_components/inventory-branch-filter";
import { withInventoryBranchNavScope } from "@/(protected)/inventory/_lib/inventory-nav";
import type { InventoryBranchOption } from "@/(protected)/inventory/_lib/inventory-scope";
import { useFinanceRealtimeRefresh } from "@/(protected)/finance/use-finance-realtime-refresh";
import type {
  ControlSurfaceCoreModuleId,
  ControlSurfaceModuleId,
} from "@/lib/control-surface-module";
import {
  flattenInventoryDeepNav,
  resolveControlSurfaceDeepNav,
  resolveControlSurfacePrimaryTabs,
  type FinanceNavFlags,
  type InventoryNavFlags,
} from "@/lib/control-surface-nav";

type BaseProps = {
  user: { name: string };
  role: StaffRole;
  /** Home / JWT branch for primary-tab resolution — not URL inventory scope. */
  homeBranchId?: number | null;
  children: ReactNode;
};

type CoreModuleProps = BaseProps & {
  module: ControlSurfaceCoreModuleId;
  inventory?: never;
  finance?: never;
};

type InventoryModuleProps = BaseProps & {
  module: "inventory";
  inventory: InventoryNavFlags & {
    allowedBranches: InventoryBranchOption[];
    defaultBranchId: number | null;
  };
  finance?: never;
};

type FinanceModuleProps = BaseProps & {
  module: "finance";
  finance: FinanceNavFlags;
  inventory?: never;
};

export type ControlSurfaceShellProps =
  | CoreModuleProps
  | InventoryModuleProps
  | FinanceModuleProps;

function isStocktakeSessionPath(pathname: string | null): boolean {
  const stocktakeMatch = pathname?.match(/^\/inventory\/stocktake\/([^/]+)/);
  if (!stocktakeMatch) return false;
  const segment = stocktakeMatch[1] ?? "";
  return segment !== "new" && segment !== "conflicts";
}

function FinanceRealtimeBridge() {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch");
  const parsedBranch =
    branchParam && branchParam !== "all" ? Number(branchParam) : NaN;
  const branchId =
    Number.isFinite(parsedBranch) && parsedBranch > 0 ? parsedBranch : null;
  useFinanceRealtimeRefresh({ branchId });
  return null;
}

/**
 * Single control_surface chrome wrapper: one AppShell + nav-as-data.
 * L0 layouts import this directly (Wave2 — no OwnerModule/Inventory/Finance
 * shell aliases).
 */
export function ControlSurfaceShell(props: ControlSurfaceShellProps) {
  const { user, role, homeBranchId, children, module } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inventory = module === "inventory" ? props.inventory : null;
  const finance = module === "finance" ? props.finance : null;

  const tier1 = useMemo(
    () => resolveControlSurfacePrimaryTabs(role, homeBranchId),
    [role, homeBranchId],
  );

  const inventoryBranchKey = searchParams.get("branchId");
  const inventoryCurrentBranchId = useMemo(() => {
    if (!inventory) return null;
    const { allowedBranches, defaultBranchId } = inventory;
    if (!inventoryBranchKey) return defaultBranchId;
    const parsed = Number(inventoryBranchKey);
    if (!Number.isInteger(parsed) || parsed <= 0) return defaultBranchId;
    if (!allowedBranches.some((branch) => branch.id === parsed)) {
      return defaultBranchId;
    }
    return parsed;
  }, [inventory, inventoryBranchKey]);

  const tier2 = useMemo(() => {
    if (module === "inventory" && inventory) {
      const {
        allowedBranches: _branches,
        defaultBranchId: _default,
        ...flags
      } = inventory;
      const base = resolveControlSurfaceDeepNav(role, "inventory", {
        inventory: flags,
      });
      return flattenInventoryDeepNav(
        withInventoryBranchNavScope(base, inventoryCurrentBranchId),
      );
    }

    if (module === "finance" && finance) {
      return resolveControlSurfaceDeepNav(role, "finance", { finance });
    }

    return resolveControlSurfaceDeepNav(role, module, {
      branchId: homeBranchId,
    });
  }, [
    finance,
    homeBranchId,
    inventory,
    inventoryCurrentBranchId,
    module,
    role,
  ]);

  const sidebarHeaderAccessory =
    inventory &&
    inventory.allowedBranches.length > 1 &&
    !isStocktakeSessionPath(pathname) ? (
      <InventoryBranchFilter
        branches={inventory.allowedBranches}
        defaultBranchId={inventory.defaultBranchId}
      />
    ) : null;

  return (
    <AppShell
      user={user}
      tier1={tier1}
      tier2={tier2}
      sidebarHeaderAccessory={sidebarHeaderAccessory}
    >
      {module === "finance" ? <FinanceRealtimeBridge /> : null}
      {children}
    </AppShell>
  );
}

export type { ControlSurfaceModuleId };
