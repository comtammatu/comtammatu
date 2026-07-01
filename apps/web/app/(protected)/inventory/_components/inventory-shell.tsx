"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Warehouse as IconWarehouse } from "lucide-react";
import { type StaffRole } from "@comtammatu/shared/auth";
import { AppShell } from "@/components/app-shell";
import { messages } from "@lib/messages";
import { resolveInventoryNav } from "../_lib/inventory-nav";
import { resolveOfficePrimaryTabs } from "@/lib/office-nav";
import type { InventoryBranchOption } from "../_lib/inventory-scope";
import { MobileTopBar } from "./mobile/mobile-top-bar";
import { InventoryBranchFilter } from "./inventory-branch-filter";

interface InventoryShellProps {
  children: ReactNode;
  user: { name: string };
  userRole: StaffRole;
  siteName: string;
  siteKind: string;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  showWasteApprovals: boolean;
  showCountManagement: boolean;
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
  siteName,
  siteKind,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  showWasteApprovals,
  showCountManagement,
  allowedBranches,
  defaultBranchId,
}: InventoryShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const branchQuery = searchParams.get("branchId");
  const productionPath = isProductionPath(pathname);
  const activeBranchId = useMemo(() => {
    if (productionPath) return null;
    if (branchQuery) {
      const parsed = Number(branchQuery);
      if (
        Number.isInteger(parsed) &&
        parsed > 0 &&
        allowedBranches.some((branch) => branch.id === parsed)
      ) {
        return parsed;
      }
    }
    return defaultBranchId;
  }, [allowedBranches, branchQuery, defaultBranchId, productionPath]);
  const activeBranch = useMemo(
    () =>
      activeBranchId == null
        ? null
        : (allowedBranches.find((branch) => branch.id === activeBranchId) ??
          null),
    [activeBranchId, allowedBranches],
  );
  const effectiveSiteName = productionPath
    ? "Bếp Trung Tâm"
    : (activeBranch?.name ?? siteName);
  const effectiveSiteKind = productionPath
    ? "central_kitchen"
    : (activeBranch?.branch_kind ?? siteKind);
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
        showCountManagement,
        siteKind: effectiveSiteKind,
      }),
    [
      effectiveSiteKind,
      showCatalogManagement,
      showCountManagement,
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
      role={userRole}
      branchId={defaultBranchId}
      brand={{
        icon: IconWarehouse,
        subLabel: messages.inventory.shell.moduleName,
        mainLabel: messages.inventory.shell.brandName,
        logoVariant: "seal",
        showBackLink: true,
      }}
      tier1={tier1}
      tier2={tier2}
      defaultPageTitle={messages.inventory.shell.brandName}
      pageHeader={{
        headerExtras: branchFilter,
        mobileTopBar: <MobileTopBar siteName={effectiveSiteName} />,
      }}
    >
      {children}
    </AppShell>
  );
}
