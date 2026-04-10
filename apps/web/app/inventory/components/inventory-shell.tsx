"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  ClipboardCheck,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  X,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { canAccess, ROLE_LABEL_VI } from "@comtammatu/shared/auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  alsoMatchPrefixes?: string[];
  procurementOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/inventory", label: "Tổng quan", icon: LayoutGrid },
  {
    href: "/inventory/stock",
    label: "Tồn kho",
    icon: Package,
    alsoMatchPrefixes: ["/inventory/issues"],
  },
  {
    href: "/inventory/receiving",
    label: "Nhập kho",
    icon: ShoppingCart,
    procurementOnly: true,
    alsoMatchPrefixes: [
      "/inventory/purchase-orders",
      "/inventory/grn",
      "/inventory/supplier-invoices",
    ],
  },
  { href: "/inventory/transfers", label: "Luân chuyển", icon: ArrowLeftRight },
  { href: "/inventory/stocktake", label: "Kiểm kê", icon: ClipboardCheck },
  { href: "/inventory/reports", label: "Báo cáo", icon: BarChart3 },
  { href: "/inventory/settings", label: "Cài đặt", icon: Settings },
];

const ROUTE_LABELS: Record<string, string> = {
  "/inventory": "Tổng quan",
  "/inventory/stock": "Tồn kho",
  "/inventory/issues": "Xuất kho",
  "/inventory/receiving": "Nhập kho",
  "/inventory/purchase-orders": "Đơn mua hàng",
  "/inventory/purchase-orders/new": "Tạo PO mới",
  "/inventory/grn": "GRN",
  "/inventory/supplier-invoices": "Hóa đơn NCC",
  "/inventory/transfers": "Luân chuyển",
  "/inventory/stocktake": "Kiểm kê",
  "/inventory/reports": "Báo cáo",
  "/inventory/settings": "Cài đặt",
  "/inventory/settings/ingredients": "Nguyên liệu",
  "/inventory/settings/recipes": "Công thức",
  "/inventory/settings/suppliers": "Nhà cung cấp",
  "/inventory/settings/expiry": "Hạn sử dụng",
};

function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const crumbs: { label: string; href: string }[] = [
    { label: "Kho hàng", href: "/inventory" },
  ];
  // Build up path segments to find deepest match
  const segments = pathname.split("/").filter(Boolean);
  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    const label = ROUTE_LABELS[current];
    if (label && current !== "/inventory") {
      crumbs.push({ label, href: current });
    }
  }
  return crumbs;
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/inventory") return pathname === "/inventory";
  if (pathname === item.href || pathname.startsWith(`${item.href}/`))
    return true;
  return (
    item.alsoMatchPrefixes?.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    ) ?? false
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase();
}

function NavContent({
  pathname,
  role,
  user,
  onNavigate,
}: {
  pathname: string;
  role: StaffRole;
  user: { name: string };
  onNavigate?: () => void;
}) {
  const showProcurement = canAccess(role, "inventory_procurement");
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.procurementOnly || showProcurement,
  );
  const initials = getInitials(user.name);

  return (
    <div className="flex h-full flex-col">
      {/* Back link */}
      <div className="px-5 pt-5 pb-1">
        <Link
          href="/admin/dashboard"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-xs font-medium mb-4"
          style={{ color: "rgba(26,28,26,0.45)" }}
        >
          ← Quản lý
        </Link>

        {/* Brand */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: "var(--md-primary-container)" }}
          >
            MT
          </div>
          <div>
            <p
              className="text-sm font-bold tracking-tight"
              style={{ color: "var(--md-on-surface)" }}
            >
              Cơm Tấm Má Tư
            </p>
            <p
              className="text-xs font-medium"
              style={{ color: "rgba(26,28,26,0.45)" }}
            >
              Kho hàng
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {visibleItems.map((item) => {
          const active = isItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <NavItemLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={Icon}
              active={active}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>

      {/* User footer */}
      <div
        className="p-4 mt-auto"
        style={{ borderTop: "1px solid rgba(26,28,26,0.05)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{
              backgroundColor: "var(--md-primary-fixed)",
              color: "var(--md-primary)",
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: "var(--md-on-surface)" }}
            >
              {user.name}
            </p>
            <p
              className="truncate text-xs"
              style={{ color: "rgba(26,28,26,0.5)" }}
            >
              {ROLE_LABEL_VI[role]}
            </p>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="flex size-8 items-center justify-center rounded-lg transition-colors"
              style={{ color: "rgba(26,28,26,0.4)" }}
              aria-label="Đăng xuất"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function NavItemLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onNavigate?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-150"
      style={{
        backgroundColor: active
          ? "rgba(255,255,255,0.5)"
          : hovered
            ? "rgba(255,255,255,0.3)"
            : "transparent",
        color: active
          ? "var(--md-primary)"
          : hovered
            ? "var(--md-on-surface)"
            : "rgba(26,28,26,0.6)",
        borderRight: active
          ? "4px solid var(--md-primary)"
          : "4px solid transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon
        className="size-4.5 shrink-0"
        style={{ color: active ? "var(--md-primary)" : "rgba(26,28,26,0.4)" }}
      />
      {label}
    </Link>
  );
}

export interface InventoryShellProps {
  children: React.ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function InventoryShell({ children, user, role }: InventoryShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = getInitials(user.name);
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <div
      className="demo-inventory-theme flex h-dvh overflow-hidden"
      style={{ backgroundColor: "var(--md-surface)" }}
    >
      {/* Desktop sidebar */}
      <aside
        className="hidden w-64 shrink-0 flex-col md:flex"
        style={{
          backgroundColor: "rgba(243,244,241,0.8)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(26,28,26,0.05)",
        }}
      >
        <NavContent pathname={pathname} role={role} user={user} />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-3 px-4 sm:px-6"
          style={{
            backgroundColor: "rgba(249,249,246,0.9)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(26,28,26,0.1)",
          }}
        >
          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-11 items-center justify-center rounded-lg transition-colors md:hidden"
            style={{ color: "rgba(26,28,26,0.5)" }}
            aria-label="Mở menu"
          >
            <Menu className="size-5" />
          </button>

          {/* Breadcrumbs (desktop) */}
          <nav className="hidden flex-1 items-center gap-1.5 text-sm md:flex">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span style={{ color: "rgba(26,28,26,0.3)" }}>/</span>
                )}
                {i === breadcrumbs.length - 1 ? (
                  <span
                    className="font-semibold"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="font-medium transition-colors"
                    style={{ color: "rgba(26,28,26,0.5)" }}
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          <div className="flex-1 md:hidden" />

          {/* Right: Bell + Avatar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-lg transition-colors"
              style={{ color: "rgba(26,28,26,0.5)" }}
              aria-label="Thông báo"
            >
              <Bell className="size-4.5" />
            </button>
            <div
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold"
              style={{
                backgroundColor: "var(--md-primary-fixed)",
                color: "var(--md-primary)",
              }}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</main>
      </div>

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex size-14 items-center justify-center rounded-2xl shadow-lg transition-transform active:scale-95 md:hidden"
        style={{ backgroundColor: "var(--md-primary)", color: "white" }}
        aria-label="Mở menu"
      >
        <Menu className="size-6" />
      </button>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setMobileOpen(false)}
            aria-label="Đóng menu"
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-72 shadow-2xl md:hidden"
            style={{
              backgroundColor: "rgba(243,244,241,0.95)",
              backdropFilter: "blur(20px)",
            }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 flex size-8 items-center justify-center rounded-lg"
              style={{ color: "rgba(26,28,26,0.5)" }}
              aria-label="Đóng"
            >
              <X className="size-4.5" />
            </button>
            <NavContent
              pathname={pathname}
              role={role}
              user={user}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </div>
  );
}
