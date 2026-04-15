"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  Factory,
  FileText,
  Hourglass,
  LayoutDashboard,
  Leaf,
  MapPin,
  Package,
  PackageOpen,
  PackagePlus,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
import {
  findActiveNavItem,
  formatPathSegment,
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { tNav, tRoute } from "../_lib/dictionary";

interface InventoryShellProps {
  children: ReactNode;
  userRole: StaffRole;
  siteName: string;
  siteKind: string;
}

function buildInventoryGroups(showProcurement: boolean): ShellNavGroup[] {
  return [
    {
      title: "Điều phối",
      items: [
        { href: "/inventory", label: tNav("home", "navigation"), icon: LayoutDashboard },
        { href: "/inventory/stock", label: tNav("stock", "navigation"), icon: Package },
        { href: "/inventory/receiving", label: tNav("receiving", "navigation"), icon: ArrowDownToLine },
      ],
    },
    {
      title: "Nghiệp vụ",
      items: [
        ...(showProcurement
          ? [
              { href: "/inventory/purchase-orders", label: tNav("purchaseOrders", "navigation"), icon: ShoppingCart },
              { href: "/inventory/grn", label: tNav("grn", "navigation"), icon: Receipt },
              { href: "/inventory/supplier-invoices", label: tNav("supplierInvoices", "navigation"), icon: FileText },
            ]
          : []),
        { href: "/inventory/transfers", label: tNav("transfers", "navigation"), icon: Truck },
        { href: "/inventory/issues", label: tNav("issues", "navigation"), icon: PackageOpen },
        { href: "/inventory/stocktake", label: tNav("stocktake", "navigation"), icon: ClipboardList },
        { href: "/inventory/expiry", label: tNav("expiry", "navigation"), icon: Hourglass },
        { href: "/inventory/production", label: tNav("production", "navigation"), icon: Factory },
      ],
    },
    {
      title: "Danh mục",
      items: [
        { href: "/inventory/ingredients", label: tNav("ingredients", "navigation"), icon: FileText },
        { href: "/inventory/suppliers", label: tNav("suppliers", "navigation"), icon: Users },
        { href: "/inventory/recipes", label: tNav("recipes", "navigation"), icon: UtensilsCrossed },
        { href: "/inventory/reports", label: tNav("reports", "navigation"), icon: BarChart3 },
        { href: "/inventory/settings", label: tNav("settings", "navigation"), icon: Leaf },
      ],
    },
  ].map((group) => ({
    ...group,
    items: group.items.filter(Boolean),
  }));
}

function resolveContext(pathname: string, groups: ShellNavGroup[]) {
  const directLabel = tRoute(pathname, "heading");
  if (directLabel !== pathname) {
    const active = findActiveNavItem(groups, pathname);
    return { title: directLabel, eyebrow: active?.label ?? "Kho vận" };
  }

  const active = findActiveNavItem(groups, pathname);
  const pathTail = active
    ? pathname
        .slice(active.href.length)
        .split("/")
        .filter(Boolean)
        .map((segment) => formatPathSegment(segment))
    : [];

  return {
    title: pathTail[pathTail.length - 1] ?? active?.label ?? "Tổng quan",
    eyebrow: active?.label ?? "Kho vận",
  };
}

export function InventoryShell({
  children,
  userRole,
  siteName,
  siteKind,
}: InventoryShellProps) {
  const pathname = usePathname();
  const showProcurement = canAccess(userRole, "inventory_procurement");
  const groups = useMemo(
    () => buildInventoryGroups(showProcurement),
    [showProcurement],
  );
  const pageContext = useMemo(
    () => resolveContext(pathname, groups),
    [groups, pathname],
  );

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <div className="space-y-3 px-2 py-1">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Package className="size-4" />
              </div>
              <p className="text-sm font-semibold">Kho vận</p>
            </div>
            <div className="rounded-md border bg-sidebar-accent/50 p-2.5 text-xs">
              <p className="font-medium">{siteName}</p>
              <p className="text-sidebar-foreground/60">
                {getInventorySiteKindLabelVi(siteKind)}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
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
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/inventory/reports">
                  <BarChart3 />
                  <span>Mở báo cáo</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/inventory/stocktake">
                  <ClipboardList />
                  <span>Đi tới kiểm kê</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {pageContext.eyebrow}
            </p>
            <h1 className="truncate text-sm font-semibold">
              {pageContext.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <MapPin className="mr-1 size-3" />
              {siteName}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/grn">
                <ArrowLeftRight className="size-4" />
                Mở GRN
              </Link>
            </Button>
            {showProcurement ? (
              <Button asChild size="sm">
                <Link href="/inventory/purchase-orders/new">
                  <PackagePlus className="size-4" />
                  Tạo PO mới
                </Link>
              </Button>
            ) : null}
          </div>
        </header>

        <main id="main-content" className="flex-1 p-4">
          <div className="space-y-4">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
