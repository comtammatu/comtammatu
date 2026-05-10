"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChartBar as IconChartBar,
  FileText as IconFileText,
  Hourglass as IconHourglass,
  Package as IconPackage,
  Receipt as IconReceipt,
  Repeat2 as IconRepeat,
  Users as IconUsers,
  Utensils as IconToolsKitchen,
  Warehouse as IconWarehouse,
} from "lucide-react";
import { type StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { AppShell } from "@/components/app-shell";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";
import { tNav } from "../_lib/dictionary";
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
  showCatalogManagement: boolean;
  allowedBranches: InventoryBranchOption[];
  defaultBranchId: number | null;
}

function isStocktakeSessionPath(pathname: string | null): boolean {
  const stocktakeMatch = pathname?.match(/^\/inventory\/stocktake\/([^/]+)/);
  if (!stocktakeMatch) return false;
  const segment = stocktakeMatch[1] ?? "";
  return segment !== "new" && segment !== "conflicts";
}

function buildInventoryGroups({
  userRole,
  showProcurement,
  showCatalogManagement,
  siteKind,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showCatalogManagement: boolean;
  siteKind: string;
}): ShellNavGroup[] {
  const isBranchSite = siteKind === "branch";
  const isBranchManager = userRole === "branch_manager";
  const isOversight = userRole === "owner" || userRole === "area_manager";
  const showBackOffice =
    !isBranchManager &&
    !isOversight &&
    (showProcurement || showCatalogManagement);
  const groups: ShellNavGroup[] = [];

  groups.push({
    title: "Vận hành",
    items: [
      {
        href: "/inventory/stock",
        label: isBranchSite ? "Tồn cần xử lý" : tNav("stock", "navigation"),
        icon: IconPackage,
      },
      {
        href: "/inventory/expiry",
        label: tNav("expiry", "navigation"),
        icon: IconHourglass,
      },
      {
        href: "/inventory/reports",
        label: tNav("reports", "navigation"),
        icon: IconChartBar,
      },
    ],
  });

  if (showProcurement) {
    groups.push({
      title: "Sổ sách NCC",
      items: [
        {
          href: "/inventory/receiving",
          label: tNav("receiving", "navigation"),
          icon: IconReceipt,
        },
        {
          href: "/inventory/supplier-returns",
          label: "Trả NCC",
          icon: IconRepeat,
        },
      ],
    });
  }

  if (showBackOffice) {
    groups.push({
      title: "Thiết lập",
      items: [
        ...(showCatalogManagement
          ? [
              {
                href: "/inventory/ingredients",
                label: tNav("ingredients", "navigation"),
                icon: IconFileText,
              },
            ]
          : []),
        ...(showProcurement
          ? [
              {
                href: "/inventory/suppliers",
                label: tNav("suppliers", "navigation"),
                icon: IconUsers,
              },
              {
                href: "/inventory/recipes",
                label: tNav("recipes", "navigation"),
                icon: IconToolsKitchen,
              },
            ]
          : []),
      ],
    });
  }

  return groups.map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}

export function InventoryShell({
  children,
  user,
  userRole,
  siteName,
  siteKind,
  showProcurement,
  showCatalogManagement,
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
    () =>
      buildInventoryGroups({
        userRole,
        showProcurement,
        showCatalogManagement,
        siteKind: effectiveSiteKind,
      }),
    [
      effectiveSiteKind,
      showCatalogManagement,
      showProcurement,
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
      brand={{
        icon: IconWarehouse,
        subLabel: messages.inventory.shell.brandName,
        mainLabel: messages.inventory.shell.moduleName,
        logoVariant: "seal",
        showBackLink: false,
      }}
      navGroups={groups}
      defaultPageTitle={messages.inventory.shell.moduleName}
      pageHeader={{
        headerExtras: branchFilter,
        omitTitle: true,
        actions: (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/dashboard">{messages.common.admin}</Link>
          </Button>
        ),
        mobileTopBar: isMobile ? (
          <MobileTopBar siteName={effectiveSiteName} />
        ) : branchFilter,
      }}
      collapsible="icon"
    >
      {children}
    </AppShell>
  );
}
