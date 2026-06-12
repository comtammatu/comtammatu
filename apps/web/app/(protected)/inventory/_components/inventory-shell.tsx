"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChartBar as IconChartBar,
  ClipboardList as IconClipboardList,
  Factory as IconBuildingFactory,
  FileText as IconFileText,
  Hourglass as IconHourglass,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  ShoppingCart as IconShoppingCart,
  Truck as IconTruck,
  Users as IconUsers,
  Utensils as IconToolsKitchen,
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

function buildInventoryGroups({
  userRole,
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  siteKind,
}: {
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  siteKind: string;
}): ShellNavGroup[] {
  const isBranchSite = siteKind === "branch";
  const isBranchManager = userRole === "branch_manager";
  const isOversight = userRole === "owner";
  const showBackOffice =
    !isBranchManager &&
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
      {
        href: "/inventory/expiry",
        label: tNav("expiry", "navigation"),
        icon: IconHourglass,
      },
      {
        href: "/inventory/issues",
        label: "Hao hụt/điều chỉnh",
        icon: IconFileText,
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
      title: "2 · Nhập/Nhận/Đối soát",
      items: [
        {
          href: "/inventory/purchase-orders",
          label: tNav("purchaseOrders", "navigation"),
          icon: IconShoppingCart,
        },
        {
          href: "/inventory/grn",
          label: tNav("grn", "navigation"),
          icon: IconReceipt,
        },
      ],
    });
  }

  groups.push({
    title: "3 · Điều phối/Sản xuất",
    items: [
      {
        href: "/inventory/transfers",
        label: isBranchSite ? "Nhận hàng & cấp bếp" : "Điều chuyển",
        icon: IconTruck,
      },
      ...(showProduction
        ? [
            {
              href: "/inventory/production",
              label: "Lệnh sản xuất",
              icon: IconBuildingFactory,
            },
          ]
        : []),
    ],
  });

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
        ...(showProcurement
          ? [
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
  showProduction,
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
        showProduction,
        showCatalogManagement,
        showSettings,
        siteKind: effectiveSiteKind,
      }),
    [
      effectiveSiteKind,
      showCatalogManagement,
      showProcurement,
      showProduction,
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
