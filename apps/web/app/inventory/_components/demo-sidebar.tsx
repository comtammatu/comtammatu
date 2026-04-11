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
import { tNav } from "../_lib/dictionary";

type NavItem =
  | { type: "link"; href: string; label: string; icon: typeof LayoutDashboard }
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
    label: "Đơn đặt hàng",
    icon: ShoppingCart,
  },
  {
    type: "link",
    href: "/inventory/grn",
    label: "Phiếu nhập kho",
    icon: ArrowDownToLine,
  },
  {
    type: "link",
    href: "/inventory/supplier-invoices",
    label: "Hóa đơn NCC",
    icon: Receipt,
  },
  {
    type: "link",
    href: "/inventory/transfers",
    label: tNav("transfers", "navigation"),
    icon: ArrowLeftRight,
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
    label: "Hạn sử dụng",
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
    label: "Nguyên liệu",
    icon: FileText,
  },
  {
    type: "link",
    href: "/inventory/suppliers",
    label: "Nhà cung cấp",
    icon: Users,
  },
  {
    type: "link",
    href: "/inventory/recipes",
    label: "Công thức",
    icon: UtensilsCrossed,
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
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo / Brand */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div
            className="flex size-8 items-center justify-center rounded-lg overflow-hidden"
            style={{ backgroundColor: "var(--md-primary-container)" }}
          >
            <span className="text-sm font-extrabold text-white">MT</span>
          </div>
          <div>
            <h1
              className="text-lg font-bold tracking-tighter"
              style={{ color: "var(--md-on-surface)" }}
            >
              Cơm Tấm Má Tư
            </h1>
            {/* <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
            >
              Cơm Tấm Má Tư
            </p> */}
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            if (item.type === "divider") {
              return (
                <div
                  key={item.label}
                  className="px-4 pb-1 pt-5 text-label font-bold uppercase tracking-widest"
                  style={{ color: "rgba(26,28,26,0.35)" }}
                >
                  {item.label}
                </div>
              );
            }
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-200"
                style={
                  active
                    ? {
                        color: "var(--md-primary)",
                        fontWeight: 700,
                        backgroundColor: "rgba(255,255,255,0.5)",
                      }
                    : {
                        color: "rgba(26,28,26,0.6)",
                      }
                }
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = "var(--md-primary)";
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = "rgba(26,28,26,0.6)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom CTA */}
      <div className="mt-auto p-6">
        <button
          type="button"
          className="w-full py-3 rounded-full font-semibold text-white shadow-sm active:scale-95 transition-transform"
          style={{
            background: `linear-gradient(135deg, var(--md-primary), var(--md-primary-container))`,
          }}
        >
          Thao tác nhanh
        </button>
      </div>
    </div>
  );
}

export function DemoSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — light frosted glass */}
      <aside
        className="hidden w-64 shrink-0 flex-col md:flex"
        style={{
          backgroundColor: "rgba(243,244,241,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(26,28,26,0.05)",
        }}
      >
        <NavContent pathname={pathname} />
      </aside>

      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex size-12 items-center justify-center rounded-full shadow-lg md:hidden"
        style={{ backgroundColor: "var(--md-primary)", color: "white" }}
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
            className="fixed inset-y-0 left-0 z-50 w-72 shadow-2xl md:hidden"
            style={{ backgroundColor: "var(--md-surface-low)" }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 opacity-50 hover:opacity-100"
              style={{ color: "var(--md-on-surface)" }}
              aria-label="Đóng"
            >
              <X className="size-5" />
            </button>
            <NavContent
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  );
}
