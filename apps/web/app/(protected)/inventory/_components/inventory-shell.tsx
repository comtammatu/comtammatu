"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Warehouse as IconWarehouse } from "lucide-react";
import { type StaffRole } from "@comtammatu/shared/auth";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { AppShell } from "@/components/app-shell";
import { messages } from "@lib/messages";
import { resolveInventoryNav } from "../_lib/inventory-nav";
import { resolveOfficeNavGroups } from "@/lib/office-nav";
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
  siteName,
  siteKind,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  showWasteApprovals,
  allowedBranches,
  defaultBranchId,
}: InventoryShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const branchQuery = searchParams.get("branchId");
  const activeBranchId = useMemo(() => {
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
  }, [allowedBranches, branchQuery, defaultBranchId]);
  const activeBranch = useMemo(
    () =>
      activeBranchId == null
        ? null
        : (allowedBranches.find((branch) => branch.id === activeBranchId) ??
          null),
    [activeBranchId, allowedBranches],
  );
  const effectiveSiteName = activeBranch?.name ?? siteName;
  const effectiveSiteKind = activeBranch?.branch_kind ?? siteKind;
  const groups = useMemo(
    () => [
      ...resolveOfficeNavGroups(userRole),
      ...resolveInventoryNav({
        userRole,
        showProcurement,
        showProduction,
        showCatalogManagement,
        showSettings,
        showWasteApprovals,
        siteKind: effectiveSiteKind,
      }),
    ],
    [
      effectiveSiteKind,
      showCatalogManagement,
      showProcurement,
      showProduction,
      showSettings,
      showWasteApprovals,
      userRole,
    ],
  );

  const isMobile = useIsMobile();
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
      role={userRole}
      branchId={defaultBranchId}
      brand={{
        icon: IconWarehouse,
        subLabel: messages.inventory.shell.moduleName,
        mainLabel: messages.inventory.shell.brandName,
        logoVariant: "seal",
        showBackLink: true,
      }}
      navGroups={groups}
      defaultPageTitle={messages.inventory.shell.brandName}
      pageHeader={{
        headerExtras: branchFilter,
        mobileTopBar: isMobile ? (
          <MobileTopBar siteName={effectiveSiteName} />
        ) : (
          branchFilter
        ),
      }}
      collapsible="icon"
    >
      {children}
    </AppShell>
  );
}
