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
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/inventory", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/inventory/stock", label: "Tồn kho", icon: Package },
  {
    href: "/inventory/receiving",
    label: "Nhập kho",
    icon: ArrowDownToLine,
  },
  {
    href: "/inventory/transfers",
    label: "Điều chuyển",
    icon: ArrowLeftRight,
  },
  {
    href: "/inventory/stocktake",
    label: "Kiểm kê",
    icon: ClipboardList,
  },
  { href: "/inventory/issues", label: "Xuất kho", icon: PackageOpen },
  { href: "/inventory/reports", label: "Báo cáo", icon: BarChart3 },
  { href: "/inventory/settings", label: "Cài đặt", icon: Leaf },
] as const;

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
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-200"
                style={
                  active
                    ? {
                        color: "var(--md-primary)",
                        fontWeight: 700,
                        borderRight: "4px solid var(--md-primary)",
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
                <item.icon className="size-5" />
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
