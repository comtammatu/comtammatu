"use client";

import { useState } from "react";
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
  Menu,
} from "lucide-react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
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

function InventoryNavigationContent({
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
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-5">
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
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        {visibleSections.map((section) => (
          <section key={section.title} className="px-2 py-2">
            <p className="mb-2 px-2 text-xs font-medium text-sidebar-foreground/70">
              {section.title}
            </p>
            <nav className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </section>
        ))}
      </div>

      <div className="space-y-3 border-t border-sidebar-border px-3 pb-4 pt-4">
        <div className="rounded-lg border border-sidebar-border bg-background px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Truy cập nhanh
          </p>
          <div className="mt-3 grid gap-2">
            <Button asChild size="sm" onClick={onNavigate}>
              <Link href="/inventory/reports">Mở báo cáo</Link>
            </Button>
            <Button asChild size="sm" variant="outline" onClick={onNavigate}>
              <Link href="/inventory/stocktake">Đi tới kiểm kê</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InventorySidebar({ userRole }: { userRole: StaffRole }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border/70 lg:block xl:w-80">
      <div className="sticky top-0 h-svh">
        <InventoryNavigationContent pathname={pathname} userRole={userRole} />
      </div>
    </aside>
  );
}

export function InventoryMobileNav({ userRole }: { userRole: StaffRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="mt-0.5 shrink-0 lg:hidden"
          aria-label="Mở điều hướng kho"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-80 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-sm"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Điều hướng kho</SheetTitle>
          <SheetDescription>
            Điều hướng các màn hình Inventory trên thiết bị nhỏ.
          </SheetDescription>
        </SheetHeader>
        <InventoryNavigationContent
          pathname={pathname}
          userRole={userRole}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
