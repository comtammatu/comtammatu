"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  FileText as IconFileText,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  Users as IconUsers,
  Warehouse as IconWarehouse,
} from "lucide-react";
import { type StaffRole } from "@comtammatu/shared/auth";
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

function buildInventoryGroups({
  userRole,
  showProcurement,
  showCatalogManagement,
  showSettings,
  siteKind,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  siteKind: string;
}): ShellNavGroup[] {
  const isBranchSite = siteKind === "branch";
  // HKD lean: branch_manager + area_manager both collapsed into "manager",
  // which is the oversight role here (gets the "Giám sát" group, not back-office).
  const isOversight = userRole === "owner" || userRole === "manager";
  const showBackOffice =
    !isOversight &&
    (showSettings || showProcurement || showCatalogManagement);
  const groups: ShellNavGroup[] = [
    {
      title: "Điểm vào",
      items: [
        {
          href: "/inventory",
          label: "Hôm nay",
          icon: IconLayoutDashboard,
          exact: true,
        },
      ],
    },
  ];

  if (isOversight) {
    groups.push({
      title: "Giám sát",
      items: [
        {
          href: "/inventory/stock",
          label: tNav("stock", "navigation"),
          icon: IconPackage,
        },
      ],
    });

    return groups.map((group) => ({
      ...group,
      items: group.items.filter(Boolean),
    }));
  }

  groups.push({
    title: "1 · Kiểm soát tồn",
    items: [
      {
        href: "/inventory/stock",
        label: isBranchSite ? "Tồn cần xử lý" : tNav("stock", "navigation"),
        icon: IconPackage,
      },
      {
        href: "/inventory/stocktake",
        label: tNav("stocktake", "navigation"),
        icon: IconClipboardList,
      },
    ],
  });

  if (showProcurement) {
    groups.push({
      title: "2 · Nhập/Đối soát",
      items: [
        {
          href: "/inventory/grn",
          label: tNav("grn", "navigation"),
          icon: IconReceipt,
        },
        {
          href: "/inventory/supplier-invoices",
          label: tNav("supplierInvoices", "navigation"),
          icon: IconFileText,
        },
      ],
    });
  }

  if (showBackOffice) {
    groups.push({
      title: "Danh mục",
      items: [
        ...(showSettings
          ? [
              {
                href: "/inventory/settings",
                label: tNav("settings", "navigation"),
                icon: IconSettings,
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
            ]
          : []),
        ...(showCatalogManagement
          ? [
              {
                href: "/inventory/ingredients",
                label: tNav("ingredients", "navigation"),
                icon: IconFileText,
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
  showSettings,
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
        showSettings,
        siteKind: effectiveSiteKind,
      }),
    [
      effectiveSiteKind,
      showCatalogManagement,
      showProcurement,
      showSettings,
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
