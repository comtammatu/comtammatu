"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { type StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import {
  resolveInventoryNav,
  withInventoryBranchNavScope,
} from "../_lib/inventory-nav";
import { resolveOwnerPrimaryTabs } from "@/lib/owner-nav";
import type { InventoryBranchOption } from "../_lib/inventory-scope";
import { InventoryBranchFilter } from "./inventory-branch-filter";

interface InventoryShellProps {
  children: ReactNode;
  user: { name: string };
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  allowedBranches: InventoryBranchOption[];
  defaultBranchId: number | null;
}

function isStocktakeSessionPath(pathname: string | null): boolean {
  const stocktakeMatch = pathname?.match(/^\/inventory\/stocktake\/([^/]+)/);
  if (!stocktakeMatch) return false;
  const segment = stocktakeMatch[1] ?? "";
  return segment !== "new" && segment !== "conflicts";
}

export function InventoryShell({
  children,
  user,
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  allowedBranches,
  defaultBranchId,
}: InventoryShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Primary tabs use the home branch, so they must not rebuild on URL branch
  // changes — keyed on userRole/defaultBranchId only.
  const tier1 = useMemo(
    () => resolveOwnerPrimaryTabs(userRole, defaultBranchId),
    [userRole, defaultBranchId],
  );
  const currentBranchId = useMemo(() => {
    const raw = searchParams.get("branchId");
    if (!raw) return defaultBranchId;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) return defaultBranchId;
    if (!allowedBranches.some((branch) => branch.id === parsed)) {
      return defaultBranchId;
    }
    return parsed;
  }, [allowedBranches, defaultBranchId, searchParams]);
  const baseTier2 = useMemo(
    () =>
      resolveInventoryNav({
        userRole,
        showProcurement,
        showProduction,
        showCatalogManagement,
        showSettings,
      }),
    [
      showCatalogManagement,
      showProcurement,
      showProduction,
      showSettings,
      userRole,
    ],
  );
  const tier2 = useMemo(
    () => [
      {
        title: "",
        items: withInventoryBranchNavScope(
          baseTier2,
          currentBranchId,
        ).flatMap((group) => group.items),
      },
    ],
    [baseTier2, currentBranchId],
  );

  const branchPickerLocked = isStocktakeSessionPath(pathname);

  const branchFilter =
    allowedBranches.length > 1 && !branchPickerLocked ? (
      <InventoryBranchFilter
        branches={allowedBranches}
        defaultBranchId={defaultBranchId}
      />
    ) : null;

  return (
    <AppShell
      user={user}
      tier1={tier1}
      tier2={tier2}
      sidebarHeaderAccessory={branchFilter}
    >
      {children}
    </AppShell>
  );
}
