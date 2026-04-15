"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  PackageOpen,
  ArrowDownToLine,
  ArrowLeftRight,
  ClipboardList,
  BarChart3,
  Factory,
  Leaf,
  Menu,
  X,
  ShoppingCart,
  FileText,
  Users,
  UtensilsCrossed,
  Hourglass,
  Receipt,
} from "lucide-react";
import { useState } from "react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { tNav } from "../_lib/dictionary";

type NavItem =
  | {
      type: "link";
      href: string;
      label: string;
      icon: typeof LayoutDashboard;
      requiresProcurement?: boolean;
    }
  | { type: "divider"; label: string };

const NAV_ITEMS: NavItem[] = [
  {
    type: "link",
    href: "/inventory",
    label: tNav("home", "navigation"),
    icon: LayoutDashboard,
  },
  {
    type: "link",
    href: "/inventory/stock",
    label: tNav("stock", "navigation"),
    icon: Package,
  },

  { type: "divider", label: "Nhập & Xuất" },
  {
    type: "link",
    href: "/inventory/purchase-orders",
    label: tNav("purchaseOrders", "navigation"),
    icon: ShoppingCart,
    requiresProcurement: true,
  },
  {
    type: "link",
    href: "/inventory/grn",
    label: tNav("grn", "navigation"),
    icon: ArrowDownToLine,
    requiresProcurement: true,
  },
  {
    type: "link",
    href: "/inventory/supplier-invoices",
    label: tNav("supplierInvoices", "navigation"),
    icon: Receipt,
    requiresProcurement: true,
  },
  {
    type: "link",
    href: "/inventory/transfers",
    label: tNav("transfers", "navigation"),
    icon: ArrowLeftRight,
  },
  {
    type: "link",
    href: "/inventory/production",
    label: tNav("production", "navigation"),
    icon: Factory,
  },
  {
    type: "link",
    href: "/inventory/issues",
    label: tNav("issues", "navigation"),
    icon: PackageOpen,
  },

  { type: "divider", label: "Kiểm soát" },
  {
    type: "link",
    href: "/inventory/stocktake",
    label: tNav("stocktake", "navigation"),
    icon: ClipboardList,
  },
  {
    type: "link",
    href: "/inventory/expiry",
    label: tNav("expiry", "navigation"),
    icon: Hourglass,
  },
  {
    type: "link",
    href: "/inventory/reports",
    label: tNav("reports", "navigation"),
    icon: BarChart3,
  },

  { type: "divider", label: "Danh mục" },
  {
    type: "link",
    href: "/inventory/ingredients",
    label: tNav("ingredients", "navigation"),
    icon: FileText,
  },
  {
    type: "link",
    href: "/inventory/suppliers",
    label: tNav("suppliers", "navigation"),
    icon: Users,
    requiresProcurement: true,
  },
  {
    type: "link",
    href: "/inventory/recipes",
    label: tNav("recipes", "navigation"),
    icon: UtensilsCrossed,
    requiresProcurement: true,
  },
  {
    type: "link",
    href: "/inventory/settings",
    label: tNav("settings", "navigation"),
    icon: Leaf,
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/inventory") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Logo / Brand */}
      <div className="p-6">
        <div className="mb-6 rounded-lg border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-primary text-sm font-extrabold text-primary-foreground shadow-sm">
              <span>MT</span>
            </div>
            <div>
              <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground">
                Không gian kho vận
              </p>
              <h1 className="text-lg font-bold tracking-tighter text-foreground">
                Cơm Tấm Má Tư
              </h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Nhập, xuất, kiểm kê, báo cáo.
          </p>
        </div>

        {/* Navigation */}
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            if (item.type === "divider") {
              return (
                <div
                  key={item.label}
                  className="px-4 pb-1 pt-5 text-label font-bold uppercase tracking-widest text-muted-foreground"
                >
                  {item.label}
                </div>
              );
            }
            if (item.requiresProcurement && !canAccessProcurement) {
              return null;
            }
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "focus-ring-standard touch-target flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-border bg-card font-semibold text-primary shadow-sm"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom CTA */}
      <div className="mt-auto p-6">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Thao tác nhanh
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Lối tắt vận hành thường dùng.
          </p>
          <Link
            href="/inventory/reports"
            className="focus-ring-standard mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95"
          >
            Báo cáo
          </Link>
        </div>
      </div>
    </div>
  );
}

export function InventorySidebar({ userRole }: { userRole: StaffRole }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — light frosted glass */}
      <aside
        className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex"
      >
        <NavContent pathname={pathname} userRole={userRole} />
      </aside>

      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="focus-ring-standard fixed bottom-4 left-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
        aria-label="Mở menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setMobileOpen(false)}
            aria-label="Đóng menu"
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-72 border-r bg-sidebar shadow-2xl md:hidden"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="focus-ring-standard absolute right-3 top-5 rounded-full border border-border bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
              aria-label="Đóng"
            >
              <X className="size-5" />
            </button>
            <NavContent
              pathname={pathname}
              userRole={userRole}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  );
}
