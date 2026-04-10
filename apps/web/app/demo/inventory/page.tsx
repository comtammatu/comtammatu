"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckSquare,
  ClipboardList,
  Clock,
  Hourglass,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { StatCard, StatusBadge } from "./_components/shared";
import {
  dashboardStats,
  transfers,
  stocktakeSessions,
  expiryAlerts,
  formatVND,
} from "./_components/mock-data";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Dashboard Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight mb-1"
            style={{ color: "var(--md-on-surface)" }}
          >
            Xin chào, Quản trị viên
          </h2>
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
          >
            <Calendar className="size-3.5" />
            <span className="text-sm">Thứ Năm, 10 Tháng 04, 2026</span>
            <span className="mx-1">•</span>
            <Clock className="size-3.5" />
            <span className="text-sm">09:42 SA</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span
            className="rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wider"
            style={{
              backgroundColor: "var(--md-secondary-container)",
              color: "var(--md-on-secondary-container)",
            }}
          >
            Trạng thái hệ thống
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-secondary)" }}
          >
            Hoạt động ổn định
          </span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatCard
          label="Tổng giá trị tồn kho"
          value={`${formatVND(dashboardStats.totalStockValue)}đ`}
          trend={{ value: "2.4% so với tháng trước", positive: true }}
        />
        <StatCard
          label="PO đang chờ"
          value={String(dashboardStats.pendingPO)}
        />
        <StatCard
          label="Phiếu luân chuyển"
          value={String(dashboardStats.activeTransfers)}
        />
        <StatCard
          label="Phiếu kiểm kê"
          value={String(dashboardStats.activeStocktakes)}
        />
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left: Alerts — 7 cols */}
        <div className="col-span-12 space-y-6 lg:col-span-7">
          {/* Reorder Alerts */}
          <div
            className="ambient-shadow overflow-hidden rounded-xl"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          >
            <div
              className="flex items-center justify-between border-b px-6 py-4"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-error-container) 30%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--md-error-container) 20%, transparent)",
              }}
            >
              <div
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: "var(--md-on-error-container)" }}
              >
                <AlertTriangle className="size-4" />
                <span>Cảnh báo tái đặt hàng</span>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold uppercase"
                style={{
                  backgroundColor: "var(--md-error-container)",
                  color: "var(--md-on-error-container)",
                }}
              >
                Ưu tiên cao
              </span>
            </div>
            <div className="space-y-4 p-6">
              {dashboardStats.reorderAlerts.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg p-3"
                  style={{ backgroundColor: "var(--md-surface)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-10 items-center justify-center rounded text-sm font-semibold"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--md-error-container) 20%, transparent)",
                        color: "var(--md-error)",
                      }}
                    >
                      {item.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p
                        className="text-xs"
                        style={{
                          color: "var(--md-on-surface-variant)",
                          opacity: 0.6,
                        }}
                      >
                        Tồn kho: {item.current}
                        {item.unit} | Ngưỡng: {item.reorder}
                        {item.unit}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/demo/inventory/purchase-orders"
                    className="text-xs font-medium hover:underline"
                    style={{ color: "var(--md-primary)" }}
                  >
                    Tạo PO ngay
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Expiry Alerts */}
          <div
            className="ambient-shadow overflow-hidden rounded-xl"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          >
            <div
              className="flex items-center justify-between border-b px-6 py-4"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-primary-fixed) 30%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--md-primary-fixed) 20%, transparent)",
              }}
            >
              <div
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: "var(--md-primary)" }}
              >
                <Hourglass className="size-4" />
                <span>Cảnh báo sắp hết hạn</span>
              </div>
              <span
                className="text-xs font-medium italic"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                Trong 7 ngày tới
              </span>
            </div>
            <div className="p-6">
              {expiryAlerts.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-xl border p-4"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-primary-fixed) 10%, transparent)",
                    borderColor:
                      "color-mix(in srgb, var(--md-primary-fixed) 20%, transparent)",
                  }}
                >
                  <div className="flex-grow">
                    <h4 className="text-sm font-semibold">
                      {item.ingredientName} – {item.lot}
                    </h4>
                    <div className="mt-1 flex items-center gap-3">
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        Hạn dùng: {item.expiryDate}
                      </span>
                      <StatusBadge
                        status={item.urgency}
                        label={
                          item.daysLeft <= 0
                            ? `Quá ${Math.abs(item.daysLeft)} ngày`
                            : `Còn ${item.daysLeft} ngày`
                        }
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-xs font-bold shadow-sm"
                    style={{
                      backgroundColor: "white",
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                    }}
                  >
                    Sử dụng trước
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Operations — 5 cols */}
        <div className="col-span-12 space-y-6 lg:col-span-5">
          {/* Transfers — vertical timeline */}
          <div
            className="ambient-shadow rounded-xl p-6"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          >
            <h3 className="mb-6 flex items-center gap-2 text-sm font-semibold">
              <Truck
                className="size-4"
                style={{ color: "var(--md-secondary)" }}
              />
              Luân chuyển đang vận chuyển
            </h3>
            <div
              className="relative space-y-8 pl-6"
              style={{ borderLeft: `2px solid var(--md-secondary-container)` }}
            >
              {transfers
                .filter(
                  (t) => t.status === "in_transit" || t.status === "confirmed",
                )
                .slice(0, 3)
                .map((t, i) => (
                  <Link
                    href={`/demo/inventory/transfers/${t.code}`}
                    key={t.id}
                    className="relative block"
                  >
                    <div
                      className="absolute -left-8 top-0 size-3 rounded-full border-4"
                      style={{
                        backgroundColor:
                          i === 0
                            ? "var(--md-secondary)"
                            : "var(--md-secondary-container)",
                        borderColor: "var(--md-surface-lowest)",
                      }}
                    />
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold">{t.code}</p>
                        <p
                          className="text-xs"
                          style={{
                            color: "var(--md-on-surface-variant)",
                            opacity: 0.6,
                          }}
                        >
                          {t.fromBranch} → {t.toBranch}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
            </div>
          </div>

          {/* Stocktake Status */}
          <div
            className="ambient-shadow rounded-xl p-6"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          >
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <ClipboardList
                className="size-4"
                style={{ color: "var(--md-tertiary)" }}
              />
              Kiểm kê đang thực hiện
            </h3>
            <div className="space-y-4">
              {stocktakeSessions
                .filter((s) => s.status === "in_progress")
                .map((s) => (
                  <Link
                    href={`/demo/inventory/stocktake/${s.code}`}
                    key={s.id}
                    className="block"
                  >
                    <div className="mb-1.5 flex items-end justify-between">
                      <span className="text-xs font-medium">
                        {s.branchName}
                      </span>
                      <span
                        className="text-xs font-bold"
                        style={{ color: "var(--md-tertiary)" }}
                      >
                        {s.progress}%
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--md-surface-container)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.progress}%`,
                          backgroundColor: "var(--md-tertiary)",
                        }}
                      />
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            icon: <ShoppingCart className="size-7" />,
            label: "Nhập kho",
            href: "/demo/inventory/receiving",
            hoverBg: "var(--md-primary-fixed)",
          },
          {
            icon: <CheckSquare className="size-7" />,
            label: "Kiểm kê",
            href: "/demo/inventory/stocktake",
            hoverBg: "var(--md-secondary-container)",
          },
          {
            icon: <Truck className="size-7" />,
            label: "Luân chuyển",
            href: "/demo/inventory/transfers",
            hoverBg: "var(--md-tertiary-container)",
          },
          {
            icon: <BarChart3 className="size-7" />,
            label: "Báo cáo",
            href: "/demo/inventory/reports",
            hoverBg: "var(--md-surface-highest)",
          },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group relative flex h-32 flex-col justify-between overflow-hidden rounded-2xl p-6 ambient-shadow transition-colors duration-300"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = action.hoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                "var(--md-surface-lowest)";
            }}
          >
            <span
              className="transition-transform group-hover:scale-110"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {action.icon}
            </span>
            <span className="text-sm font-semibold">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
