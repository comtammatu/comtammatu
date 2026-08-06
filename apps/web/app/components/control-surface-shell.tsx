"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MODULE_ACL, type StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import { InventoryBranchFilter } from "@/(protected)/inventory/_components/inventory-branch-filter";
import { withInventoryBranchNavScope } from "@/(protected)/inventory/_lib/inventory-nav";
import type { InventoryBranchOption } from "@/(protected)/inventory/_lib/inventory-scope";
import { withFinanceNavScope } from "@/(protected)/finance/components/finance-nav";
import { parseFinanceParams } from "@/(protected)/finance/_lib/finance-params";
import { useFinanceRealtimeRefresh } from "@/(protected)/finance/use-finance-realtime-refresh";
import type { ControlSurfaceModuleId } from "@/lib/control-surface-module";
import { CONTROL_SURFACE_MODULE_IDS } from "@/lib/control-surface-module";
import {
  flattenInventoryDeepNav,
  resolveControlSurfaceDeepNav,
  resolveControlSurfacePrimaryTabs,
  type FinanceNavFlags,
  type InventoryNavFlags,
} from "@/lib/control-surface-nav";
import {
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

type BaseProps = {
  user: { name: string };
  role: StaffRole;
  /** Home / JWT branch for primary-tab resolution — not URL inventory scope. */
  homeBranchId?: number | null;
  personalHref?: string;
  children: ReactNode;
  inventory: InventoryNavFlags & {
    allowedBranches: InventoryBranchOption[];
    defaultBranchId: number | null;
  };
  finance: FinanceNavFlags;
  hr: { canOpen: boolean; canOpenPayroll: boolean };
};

export type ControlSurfaceShellProps = BaseProps;

type ActiveControlSurfaceModule =
  ControlSurfaceModuleId | "notifications" | "me";

function resolveActiveModule(
  pathname: string | null,
): ActiveControlSurfaceModule | null {
  if (pathname === "/") return "owner";
  const segment = pathname?.split("/")[1];
  if (segment === "notifications" || segment === "me") return segment;
  return (
    CONTROL_SURFACE_MODULE_IDS.find((moduleId) => moduleId === segment) ?? null
  );
}

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
 * Persistent control_surface chrome for every protected management route.
 */
export function ControlSurfaceShell(props: ControlSurfaceShellProps) {
  const {
    user,
    role,
    homeBranchId,
    personalHref,
    children,
    inventory,
    finance,
    hr,
  } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeModule = resolveActiveModule(pathname);
  const hrBranchScope = resolveHrBranchScope(searchParams.get("branch"));

  const tier1 = useMemo(
    () =>
      resolveControlSurfacePrimaryTabs(role, homeBranchId).filter(
        (item) => item.href !== "/hr" || hr.canOpen,
      ).map((item) =>
        activeModule === "hr" && item.href === "/hr"
          ? { ...item, href: withHrBranchScope(item.href, hrBranchScope) }
          : item,
      ),
    [activeModule, role, homeBranchId, hr.canOpen, hrBranchScope],
  );

  const inventoryBranchKey = searchParams.get("branchId");
  const financeScopeKey = searchParams.toString();
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
    if (activeModule === "inventory") {
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

    if (activeModule === "finance") {
      const financeParams = parseFinanceParams(
        Object.fromEntries(new URLSearchParams(financeScopeKey).entries()),
      );
      return withFinanceNavScope(
        resolveControlSurfaceDeepNav(role, "finance", { finance }),
        financeParams,
      );
    }

    if (
      !activeModule ||
      activeModule === "notifications" ||
      activeModule === "me"
    ) {
      return [];
    }

    const resolved = resolveControlSurfaceDeepNav(role, activeModule, {
      branchId: homeBranchId,
    });
    if (activeModule !== "hr") return resolved;

    return resolved.map((group) => ({
      ...group,
      items: group.items
        .filter(
          (item) => hr.canOpenPayroll || item.href !== "/hr/payroll",
        )
        .map((item) => ({
          ...item,
          href: withHrBranchScope(item.href, hrBranchScope),
        })),
    }));
  }, [
    finance,
    financeScopeKey,
    homeBranchId,
    inventory,
    inventoryCurrentBranchId,
    activeModule,
    role,
    hr.canOpenPayroll,
    hrBranchScope,
  ]);

  const sidebarHeaderAccessory =
    activeModule === "inventory" &&
    inventory.allowedBranches.length > 1 &&
    !isStocktakeSessionPath(pathname) ? (
      <InventoryBranchFilter
        branches={inventory.allowedBranches}
        defaultBranchId={inventory.defaultBranchId}
      />
    ) : null;

  if (!activeModule) return children;

  return (
    <AppShell
      user={user}
      tier1={tier1}
      tier2={tier2}
      sidebarHeaderAccessory={sidebarHeaderAccessory}
      personalHref={personalHref}
      mobileHeaderTitle={
        activeModule === "me" ? MODULE_ACL.me.label : undefined
      }
    >
      {activeModule === "finance" ? <FinanceRealtimeBridge /> : null}
      {children}
    </AppShell>
  );
}

export type { ControlSurfaceModuleId };
