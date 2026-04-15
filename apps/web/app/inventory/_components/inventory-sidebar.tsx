"use client";

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
  Package,
  PackageOpen,
  Receipt,
  ShoppingCart,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@comtammatu/ui/components/sidebar";
import { tNav } from "../_lib/dictionary";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  requiresProcurement?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavGroup[] = [
  {
    title: "Điều hành",
    items: [
      {
        href: "/inventory",
        label: tNav("home", "navigation"),
        icon: LayoutDashboard,
      },
      {
        href: "/inventory/stock",
        label: tNav("stock", "navigation"),
        icon: Package,
      },
    ],
  },
  {
    title: "Nhập xuất",
    items: [
      {
        href: "/inventory/purchase-orders",
        label: tNav("purchaseOrders", "navigation"),
        icon: ShoppingCart,
        requiresProcurement: true,
      },
      {
        href: "/inventory/grn",
        label: tNav("grn", "navigation"),
        icon: ArrowDownToLine,
        requiresProcurement: true,
      },
      {
        href: "/inventory/supplier-invoices",
        label: tNav("supplierInvoices", "navigation"),
        icon: Receipt,
        requiresProcurement: true,
      },
      {
        href: "/inventory/transfers",
        label: tNav("transfers", "navigation"),
        icon: ArrowLeftRight,
      },
      {
        href: "/inventory/production",
        label: tNav("production", "navigation"),
        icon: Factory,
      },
      {
        href: "/inventory/issues",
        label: tNav("issues", "navigation"),
        icon: PackageOpen,
      },
    ],
  },
  {
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
  },
  {
    title: "Danh mục",
    items: [
      {
        href: "/inventory/ingredients",
        label: tNav("ingredients", "navigation"),
        icon: FileText,
      },
      {
        href: "/inventory/suppliers",
        label: tNav("suppliers", "navigation"),
        icon: Users,
        requiresProcurement: true,
      },
      {
        href: "/inventory/recipes",
        label: tNav("recipes", "navigation"),
        icon: UtensilsCrossed,
        requiresProcurement: true,
      },
      {
        href: "/inventory/settings",
        label: tNav("settings", "navigation"),
        icon: Leaf,
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/inventory") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavContent({
  pathname,
  userRole,
  onNavigate,
}: {
  pathname: string;
  userRole: StaffRole;
  onNavigate?: () => void;
}) {
  const canAccessProcurement = canAccess(userRole, "inventory_procurement");
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.requiresProcurement || canAccessProcurement,
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-black text-sidebar-primary-foreground">
              MT
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                Cơm Tấm Má Tư
              </p>
              <p className="text-xs uppercase tracking-widest text-sidebar-foreground/60">
                Inventory Workspace
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-sidebar-border bg-background px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Phạm vi
              </p>
              <Badge
                variant={canAccessProcurement ? "success" : "secondary"}
                className="text-xs"
              >
                {canAccessProcurement ? "Procurement" : "Core"}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-5 text-foreground">
              Điều hành nhập, xuất, kiểm kê và báo cáo trong một luồng thống nhất.
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {visibleSections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={active}
                      onClick={onNavigate}
                    >
                      <Link href={item.href} aria-current={active ? "page" : undefined}>
                        <item.icon className="size-4" />
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

      <SidebarFooter className="space-y-3 border-t border-sidebar-border px-3 pb-4 pt-4">
        <div className="rounded-lg border border-sidebar-border bg-background px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Truy cập nhanh
          </p>
          <div className="mt-3 grid gap-2">
            <Button asChild size="sm">
              <Link href="/inventory/reports">Mở báo cáo</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/inventory/stocktake">Đi tới kiểm kê</Link>
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function InventorySidebar({ userRole }: { userRole: StaffRole }) {
  const pathname = usePathname();

  return <NavContent pathname={pathname} userRole={userRole} />;
}
