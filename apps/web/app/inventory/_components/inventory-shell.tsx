"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  IconArrowBarDown,
  IconChartBar,
  IconClipboardList,
  IconClipboardCheck,
  IconBuildingFactory,
  IconFileText,
  IconHourglass,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconLogout,
  IconCreditCard,
  IconPackage,
  IconPackageOff,
  IconReceipt,
  IconRobot,
  IconSettings,
  IconShoppingCart,
  IconBuildingStore,
  IconTruck,
  IconUsers,
  IconToolsKitchen,
  IconAlertOctagon,
  IconTrash,
} from "@tabler/icons-react";
import { ROLE_LABEL_VI, type StaffRole } from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@comtammatu/ui/components/sidebar";
import { isNavItemActive, type ShellNavGroup } from "@/lib/shell-primitives";
import { tNav } from "../_lib/dictionary";
import type { InventoryBranchOption } from "../_lib/inventory-scope";
import { MobileTopBar } from "./mobile/mobile-top-bar";
import { InventoryBranchFilter } from "./inventory-branch-filter";
import { InventoryThemeToggle } from "./inventory-theme-toggle";

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

function buildInventoryGroups({
  showProcurement,
  showProduction,
  showCatalogManagement,
  showSettings,
  siteKind,
}: {
  showProcurement: boolean;
  showProduction: boolean;
  showCatalogManagement: boolean;
  showSettings: boolean;
  siteKind: string;
}): ShellNavGroup[] {
  const isBranchSite = siteKind === "branch";
  const issueLabel = isBranchSite ? "Cấp bếp" : "Xuất kho";
  const groups: ShellNavGroup[] = [
    {
      title: "Hôm nay",
      items: [
        { href: "/inventory", label: "Tổng quan", icon: IconLayoutDashboard },
        {
          href: "/inventory/dashboard",
          label: "Dashboard v2",
          icon: IconLayoutGrid,
        },
        {
          href: "/inventory/stock",
          label: tNav("stock", "navigation"),
          icon: IconPackage,
        },
      ],
    },
  ];

  if (showProcurement) {
    groups.push({
      title: "Nhập hàng HQ",
      items: [
        {
          href: "/inventory/receiving",
          label: tNav("receiving", "navigation"),
          icon: IconArrowBarDown,
        },
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
        {
          href: "/inventory/supplier-invoices",
          label: tNav("supplierInvoices", "navigation"),
          icon: IconFileText,
        },
        {
          href: "/inventory/supplier-returns",
          label: tNav("supplierReturns", "navigation"),
          icon: IconPackageOff,
        },
        {
          href: "/inventory/supplier-credit-notes",
          label: tNav("supplierCreditNotes", "navigation"),
          icon: IconCreditCard,
        },
      ],
    });
  }

  groups.push({
    title: "Điều chuyển nội bộ",
    items: [
      {
        href: "/inventory/transfers",
        label: tNav("transfers", "navigation"),
        icon: IconTruck,
      },
    ],
  });

  groups.push({
    title: isBranchSite ? "Vận hành chi nhánh" : "Tồn và xuất",
    items: [
      { href: "/inventory/issues", label: issueLabel, icon: IconPackage },
      { href: "/inventory/waste/new", label: "Tạo phiếu hao hụt", icon: IconTrash },
      {
        href: "/inventory/waste/approvals",
        label: "Duyệt hao hụt",
        icon: IconClipboardCheck,
      },
      {
        href: "/inventory/waste/auto",
        label: "Waste auto-gen",
        icon: IconRobot,
      },
    ],
  });

  if (showProduction) {
    groups.push({
      title: "Bếp trung tâm",
      items: [
        {
          href: "/inventory/production",
          label: tNav("production", "navigation"),
          icon: IconBuildingFactory,
        },
      ],
    });
  }

  groups.push({
    title: "Kiểm soát",
    items: [
      {
        href: "/inventory/stocktake",
        label: tNav("stocktake", "navigation"),
        icon: IconClipboardList,
      },
      {
        href: "/inventory/stocktake/new",
        label: "Mở phiên kiểm kê v2",
        icon: IconClipboardCheck,
      },
      {
        href: "/inventory/stocktake/conflicts",
        label: "Conflict queue",
        icon: IconAlertOctagon,
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

  groups.push({
    title: "Quản lý",
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
  const groups = useMemo(
    () =>
      buildInventoryGroups({
        showProcurement,
        showProduction,
        showCatalogManagement,
        showSettings,
        siteKind,
      }),
    [
      showCatalogManagement,
      showProcurement,
      showProduction,
      showSettings,
      siteKind,
    ],
  );

  const isMobileRoute = pathname?.startsWith("/inventory/m") ?? false;
  const siteKindLabel = getInventorySiteKindLabelVi(siteKind);
  const showSiteKindLabel = siteKindLabel !== siteName;
  if (isMobileRoute) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <MobileTopBar siteName={siteName} />
        <main className="flex-1 pb-24">{children}</main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-3 p-3">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              MT
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold">Cơm Tấm Má Tư</span>
              <span className="text-xs text-muted-foreground">
                Quản lý kho
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-sidebar-accent/40 px-2 py-1.5 text-sm group-data-[collapsible=icon]:hidden">
            <IconBuildingStore className="size-4 shrink-0" />
            {allowedBranches.length > 1 ? (
              <div className="min-w-0 flex-1">
                <InventoryBranchFilter
                  branches={allowedBranches}
                  defaultBranchId={defaultBranchId}
                />
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium">{siteName}</span>
                {showSiteKindLabel ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {siteKindLabel}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, pathname);
                    const Icon = item.icon;
                    const href = branchQuery
                      ? `${item.href}?branchId=${branchQuery}`
                      : item.href;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                        >
                          <Link href={href}>
                            <Icon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="p-2">
          <SidebarSeparator />
          <div className="flex items-center gap-2 px-1 pt-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABEL_VI[userRole]}
              </p>
            </div>
            <InventoryThemeToggle />
            <form action="/api/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <IconLogout className="size-4" />
              </Button>
            </form>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
