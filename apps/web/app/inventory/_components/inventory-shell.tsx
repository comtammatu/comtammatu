"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  BarChart3,
  ClipboardList,
  Factory,
  FileText,
  Hourglass,
  LayoutDashboard,
  LogOut,
  Package,
  PackageOpen,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
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
import { MobileTopBar } from "./mobile/mobile-top-bar";

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
        { href: "/inventory", label: "Tổng quan", icon: LayoutDashboard },
        {
          href: "/inventory/stock",
          label: tNav("stock", "navigation"),
          icon: Package,
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
          icon: ArrowDownToLine,
        },
        {
          href: "/inventory/purchase-orders",
          label: tNav("purchaseOrders", "navigation"),
          icon: ShoppingCart,
        },
        {
          href: "/inventory/grn",
          label: tNav("grn", "navigation"),
          icon: Receipt,
        },
        {
          href: "/inventory/supplier-invoices",
          label: tNav("supplierInvoices", "navigation"),
          icon: FileText,
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
        icon: Truck,
      },
    ],
  });

  groups.push({
    title: isBranchSite ? "Vận hành chi nhánh" : "Tồn và xuất",
    items: [
      { href: "/inventory/issues", label: issueLabel, icon: PackageOpen },
    ],
  });

  if (showProduction) {
    groups.push({
      title: "Bếp trung tâm",
      items: [
        {
          href: "/inventory/production",
          label: tNav("production", "navigation"),
          icon: Factory,
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
        icon: ClipboardList,
      },
      {
        href: "/inventory/expiry",
        label: tNav("expiry", "navigation"),
        icon: Hourglass,
      },
      {
        href: "/inventory/reports",
        label: tNav("reports", "navigation"),
        icon: BarChart3,
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
              icon: Settings,
            },
          ]
        : []),
      ...(showProcurement
        ? [
            {
              href: "/inventory/suppliers",
              label: tNav("suppliers", "navigation"),
              icon: Users,
            },
          ]
        : []),
      ...(showCatalogManagement
        ? [
            {
              href: "/inventory/ingredients",
              label: tNav("ingredients", "navigation"),
              icon: FileText,
            },
          ]
        : []),
      ...(showProcurement
        ? [
            {
              href: "/inventory/recipes",
              label: tNav("recipes", "navigation"),
              icon: UtensilsCrossed,
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
}: InventoryShellProps) {
  const pathname = usePathname();
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
            <Store className="size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">{siteName}</span>
              {showSiteKindLabel ? (
                <span className="truncate text-xs text-muted-foreground">
                  {siteKindLabel}
                </span>
              ) : null}
            </div>
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
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
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
            <form action="/api/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
