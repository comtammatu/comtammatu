"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MODULE_ACL, type StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import { ControlSurfaceScopeControl } from "@/components/control-surface-scope-control";
import { InventoryBranchFilter } from "@/(protected)/inventory/_components/inventory-branch-filter";
import { withInventoryBranchNavScope } from "@/(protected)/inventory/_lib/inventory-nav";
import type { InventoryBranchOption } from "@/(protected)/inventory/_lib/inventory-scope";
import { withFinanceNavScope } from "@/(protected)/finance/components/finance-nav";
import {
  financeParamsToBranchScope,
  parseFinanceParams,
} from "@/(protected)/finance/_lib/finance-params";
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
  getControlSurfaceScopeBranchId,
  resolveScopeFromSearchParams,
  withControlSurfaceBranchScope,
} from "@/lib/control-surface-scope";
import {
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

type ScopeSite = {
  id: number;
  name: string;
  branch_kind: string;
};

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
    canSelectAll: boolean;
  };
  finance: FinanceNavFlags & {
    branches: ScopeSite[];
    canSelectAll: boolean;
  };
  hr: {
    canOpen: boolean;
    canOpenPayroll: boolean;
    branches: ScopeSite[];
    canSelectAll: boolean;
  };
  work: {
    canManageTeam: boolean;
  };
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

function FinanceRealtimeBridge({ pathname }: { pathname: string | null }) {
  const searchParams = useSearchParams();
  const scope = resolveScopeFromSearchParams(searchParams, { fallback: "all" });
  useFinanceRealtimeRefresh({
    branchId: getControlSurfaceScopeBranchId(scope),
    pathname,
  });
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
    work,
  } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeModule = resolveActiveModule(pathname);
  const hrBranchScope = resolveHrBranchScope(searchParams.get("branch"));

  const inventoryScopeToken = useMemo(() => {
    const allowedIds = inventory.allowedBranches.map((branch) => branch.id);
    const fallback =
      inventory.canSelectAll
        ? ("all" as const)
        : inventory.defaultBranchId != null
          ? (String(inventory.defaultBranchId) as `${number}`)
          : ("all" as const);
    return resolveScopeFromSearchParams(searchParams, {
      allowedIds,
      fallback,
    });
  }, [searchParams, inventory]);

  const inventoryCurrentBranchId =
    getControlSurfaceScopeBranchId(inventoryScopeToken);
  const inventoryScopeAll = inventoryScopeToken === "all";

  const tier1 = useMemo(
    () =>
      resolveControlSurfacePrimaryTabs(role, homeBranchId)
        .filter((item) => item.href !== "/hr" || hr.canOpen)
        .map((item) => {
          if (activeModule === "hr" && item.href === "/hr") {
            return { ...item, href: withHrBranchScope(item.href, hrBranchScope) };
          }
          if (activeModule === "inventory" && item.href === "/inventory") {
            return {
              ...item,
              href: withControlSurfaceBranchScope(
                item.href,
                inventoryScopeToken,
                { prefixes: ["/inventory"] },
              ),
            };
          }
          if (activeModule === "finance" && item.href === "/finance") {
            const financeParams = parseFinanceParams(
              Object.fromEntries(searchParams.entries()),
            );
            return {
              ...item,
              href: withControlSurfaceBranchScope(
                item.href,
                financeParamsToBranchScope(financeParams),
                { prefixes: ["/finance"] },
              ),
            };
          }
          return item;
        }),
    [
      activeModule,
      role,
      homeBranchId,
      hr.canOpen,
      hrBranchScope,
      inventoryScopeToken,
      searchParams,
    ],
  );

  const financeScopeKey = searchParams.toString();

  const tier2 = useMemo(() => {
    if (activeModule === "inventory") {
      const {
        allowedBranches: _branches,
        defaultBranchId: _default,
        canSelectAll: _canSelectAll,
        ...flags
      } = inventory;
      const base = resolveControlSurfaceDeepNav(role, "inventory", {
        inventory: flags,
      });
      return flattenInventoryDeepNav(
        withInventoryBranchNavScope(base, inventoryCurrentBranchId, {
          scopeAll: inventoryScopeAll && inventory.canSelectAll,
        }),
      );
    }

    if (activeModule === "finance") {
      const {
        branches: _financeBranches,
        canSelectAll: _financeCanSelectAll,
        ...financeFlags
      } = finance;
      const financeParams = parseFinanceParams(
        Object.fromEntries(new URLSearchParams(financeScopeKey).entries()),
      );
      return withFinanceNavScope(
        resolveControlSurfaceDeepNav(role, "finance", {
          finance: financeFlags,
        }),
        financeParams,
      );
    }

    if (activeModule === "work") {
      return resolveControlSurfaceDeepNav(role, "work", {
        work: { canManageTeam: work.canManageTeam },
      });
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
        .filter((item) => hr.canOpenPayroll || item.href !== "/hr/payroll")
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
    inventoryScopeAll,
    activeModule,
    role,
    hr.canOpenPayroll,
    hrBranchScope,
    work.canManageTeam,
  ]);

  const showInventoryScope =
    activeModule === "inventory" &&
    (inventory.canSelectAll || inventory.allowedBranches.length > 1) &&
    !isStocktakeSessionPath(pathname);

  const showHrScope =
    activeModule === "hr" &&
    (hr.canSelectAll || hr.branches.length > 1);

  const showFinanceScope =
    activeModule === "finance" &&
    (finance.canSelectAll || finance.branches.length > 1);

  const scopeAccessory = showInventoryScope ? (
    <InventoryBranchFilter
      branches={inventory.allowedBranches}
      defaultBranchId={inventory.defaultBranchId}
      canSelectAll={inventory.canSelectAll}
    />
  ) : showHrScope ? (
    <ControlSurfaceScopeControl
      sites={hr.branches}
      aggregates={hr.canSelectAll ? ["all", "office"] : []}
      clearHrDrilldown
      fallback="all"
    />
  ) : showFinanceScope ? (
    <ControlSurfaceScopeControl
      sites={finance.branches}
      aggregates={
        finance.canSelectAll ? ["all", "company", "branches"] : []
      }
      clearFinanceLocation
      fallback="all"
    />
  ) : null;

  if (!activeModule) return children;

  return (
    <AppShell
      user={user}
      tier1={tier1}
      tier2={tier2}
      sidebarHeaderAccessory={scopeAccessory}
      mobileScopeAccessory={scopeAccessory}
      personalHref={personalHref}
      mobileHeaderTitle={
        activeModule === "me" ? MODULE_ACL.me.label : undefined
      }
    >
      {activeModule === "finance" ? (
        <FinanceRealtimeBridge pathname={pathname} />
      ) : null}
      {children}
    </AppShell>
  );
}

export type { ControlSurfaceModuleId };
