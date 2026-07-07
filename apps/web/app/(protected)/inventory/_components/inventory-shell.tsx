"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { type StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import { messages } from "@lib/messages";
import { resolveInventoryNav } from "../_lib/inventory-nav";
import { resolveOfficePrimaryTabs } from "@/lib/office-nav";
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
  showWasteApprovals: boolean;
  showCountAssignments: boolean;
  showCountSlips: boolean;
  allowedBranches: InventoryBranchOption[];
  defaultBranchId: number | null;
}

function isStocktakeSessionPath(pathname: string | null): boolean {
  const stocktakeMatch = pathname?.match(/^\/inventory\/stocktake\/([^/]+)/);
  if (!stocktakeMatch) return false;
  const segment = stocktakeMatch[1] ?? "";
  return segment !== "new" && segment !== "conflicts";
}

function isProductionPath(pathname: string | null): boolean {
  return pathname === "/inventory/production";
}

export function InventoryShell({
  children,
  user,
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  showWasteApprovals,
  showCountAssignments,
  showCountSlips,
  allowedBranches,
  defaultBranchId,
}: InventoryShellProps) {
  const pathname = usePathname();
  const productionPath = isProductionPath(pathname);
  // Primary tabs use the home branch, so they must not rebuild on URL branch
  // changes — keyed on userRole/defaultBranchId only.
  const tier1 = useMemo(
    () => resolveOfficePrimaryTabs(userRole, defaultBranchId),
    [userRole, defaultBranchId],
  );
  const tier2 = useMemo(
    () =>
      resolveInventoryNav({
        userRole,
        showProcurement,
        showProduction,
        showCatalogManagement,
        showSettings,
        showWasteApprovals,
        showCountAssignments,
        showCountSlips,
      }),
    [
      showCatalogManagement,
      showCountAssignments,
      showCountSlips,
      showProcurement,
      showProduction,
      showSettings,
      showWasteApprovals,
      userRole,
    ],
  );

  const branchPickerLocked = productionPath || isStocktakeSessionPath(pathname);

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
      defaultPageTitle={messages.inventory.shell.brandName}
      pageHeader={{
        headerExtras: branchFilter,
      }}
    >
      {children}
    </AppShell>
  );
}
