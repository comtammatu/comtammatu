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
  useSidebar,
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

export function InventorySidebar({ userRole }: { userRole: StaffRole }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const canAccessProcurement = canAccess(userRole, "inventory_procurement");
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.requiresProcurement || canAccessProcurement,
    ),
  })).filter((section) => section.items.length > 0);

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-2 py-3">
        <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent p-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-black text-sidebar-primary-foreground">
            MT
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="text-xs uppercase tracking-widest text-sidebar-foreground/60">
              Inventory
            </p>
            <span className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">
              Cơm Tấm Má Tư
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {visibleSections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href} onClick={closeMobile}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Mở báo cáo">
              <Link href="/inventory/reports" onClick={closeMobile}>
                <BarChart3 className="size-4" />
                <span>Mở báo cáo</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Đi tới kiểm kê">
              <Link href="/inventory/stocktake" onClick={closeMobile}>
                <ClipboardList className="size-4" />
                <span>Đi tới kiểm kê</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
