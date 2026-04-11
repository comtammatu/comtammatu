"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  HelpCircle,
  ChevronRight,
  MapPin,
  ChevronDown,
} from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "/inventory": "Dashboard",
  "/inventory/stock": "Stock",
  "/inventory/issues": "Issues",
  "/inventory/receiving": "Receiving Hub",
  "/inventory/purchase-orders": "Purchase Orders",
  "/inventory/purchase-orders/new": "Tạo PO Mới",
  "/inventory/grn": "GRN",
  "/inventory/supplier-invoices": "Hóa đơn NCC",
  "/inventory/transfers": "Transfers",
  "/inventory/stocktake": "Stocktake",
  "/inventory/expiry": "Expiry Management",
  "/inventory/reports": "Reports",
  "/inventory/ingredients": "Nguyên liệu",
  "/inventory/recipes": "Công thức",
  "/inventory/suppliers": "Suppliers",
  "/inventory/settings": "Cài đặt",
  "/inventory/settings/ingredients": "Nguyên liệu",
  "/inventory/settings/recipes": "Công thức",
  "/inventory/settings/suppliers": "Nhà cung cấp",
  "/inventory/settings/expiry": "Hạn sử dụng",
};

function getBreadcrumbs(pathname: string) {
  const base = "Trang chủ";
  const label = ROUTE_LABELS[pathname];
  if (label) return [base, label];
  // Dynamic routes
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 4) {
    const parentPath = "/" + segments.slice(0, 3).join("/");
    const parentLabel = ROUTE_LABELS[parentPath] ?? segments[2];
    return [base, parentLabel, segments[3]];
  }
  return [base, "Dashboard"];
}

export function DemoHeader() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 py-3"
      style={{
        backgroundColor: "rgba(249,249,246,0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(26,28,26,0.1)",
      }}
    >
      {/* Left: breadcrumbs + branch selector */}
      <div className="flex items-center gap-4">
        <div
          className="flex items-center text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          {crumbs.map((crumb, i) => (
            <span key={crumb} className="flex items-center">
              {i > 0 && <ChevronRight className="mx-1.5 size-3.5 opacity-40" />}
              <span
                className={i === crumbs.length - 1 ? "font-bold" : ""}
                style={
                  i === crumbs.length - 1
                    ? { color: "var(--md-primary)" }
                    : undefined
                }
              >
                {crumb}
              </span>
            </span>
          ))}
        </div>

        <div
          className="mx-2 h-6 w-px"
          style={{ backgroundColor: "var(--md-outline-variant)", opacity: 0.3 }}
        />

        {/* Branch selector */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold"
          style={{
            backgroundColor: "var(--md-surface-low)",
            color: "var(--md-on-surface-variant)",
            border: "1px solid rgba(224,192,178,0.2)",
          }}
        >
          <MapPin className="size-3.5" />
          <span>HQ/Branch Selector</span>
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      {/* Right: action buttons + icons + avatar */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <Link
            href="/inventory/grn"
            className="rounded-full px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ color: "var(--md-primary)" }}
          >
            GRN
          </Link>
          <Link
            href="/inventory/purchase-orders/new"
            className="rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
            style={{
              background: `linear-gradient(135deg, var(--md-primary), var(--md-primary-container))`,
            }}
          >
            Create PO
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--md-on-surface-variant)" }}
            aria-label="Notifications"
          >
            <Bell className="size-4.5" />
          </button>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--md-on-surface-variant)" }}
            aria-label="Help"
          >
            <HelpCircle className="size-4.5" />
          </button>
          <div
            className="size-8 overflow-hidden rounded-full"
            style={{
              backgroundColor: "var(--md-surface-highest)",
              border: "1px solid rgba(224,192,178,0.2)",
            }}
          >
            <div
              className="flex size-full items-center justify-center text-xs font-bold"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              QT
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
