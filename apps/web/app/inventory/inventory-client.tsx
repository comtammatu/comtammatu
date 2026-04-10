"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  Hourglass,
  Package,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { StatCard, StatusBadge } from "./_components/shared";
import type { ReorderAlertRow, ExpiryAlertRow } from "./page";
import type { InTransitTransfer } from "./report-actions";

interface ActiveStocktake {
  id: number;
  branchName: string;
  progress?: number;
}

interface InventoryDashboardProps {
  reorderAlerts: ReorderAlertRow[];
  expiryAlerts: ExpiryAlertRow[];
  inTransitTransfers: InTransitTransfer[];
  activeStocktakes: ActiveStocktake[];
  showProcurement: boolean;
}

export function InventoryDashboard({
  reorderAlerts,
  expiryAlerts,
  inTransitTransfers,
  activeStocktakes,
  showProcurement,
}: InventoryDashboardProps) {
  const expiredCount = expiryAlerts.filter(
    (a) => a.urgency === "expired",
  ).length;

  const allGreen =
    reorderAlerts.length === 0 &&
    expiryAlerts.length === 0 &&
    inTransitTransfers.length === 0 &&
    activeStocktakes.length === 0;

  const now = new Date();
  const dateStr = now.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2
            className="mb-1 text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Tổng quan kho
          </h2>
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
          >
            <Calendar className="size-3.5" />
            <span>{dateStr}</span>
            <span className="mx-1">&bull;</span>
            <Clock className="size-3.5" />
            <span>{timeStr}</span>
          </div>
        </div>
        {allGreen && (
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
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatCard
          label="Cần đặt hàng"
          value={String(reorderAlerts.length)}
          trend={
            reorderAlerts.length > 0
              ? { value: String(reorderAlerts.length), positive: false }
              : undefined
          }
        />
        <StatCard
          label="Sắp hết hạn"
          value={String(expiryAlerts.length)}
          trend={
            expiredCount > 0
              ? { value: `${String(expiredCount)} hết hạn`, positive: false }
              : undefined
          }
        />
        <StatCard
          label="Đang vận chuyển"
          value={String(inTransitTransfers.length)}
        />
        <StatCard
          label="Đang kiểm kê"
          value={String(activeStocktakes.length)}
        />
      </div>

      {/* All-green banner */}
      {allGreen && (
        <div
          className="flex items-center gap-3 rounded-2xl p-4"
          style={{
            backgroundColor: "var(--md-secondary-container)",
            color: "var(--md-on-secondary-container)",
          }}
        >
          <CheckCircle2 className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">Mọi thứ ổn!</p>
            <p className="text-sm opacity-80">
              Không có cảnh báo hay việc cần xử lý ngay
            </p>
          </div>
        </div>
      )}

      {/* Bento Grid */}
      {!allGreen && (
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Alerts — 7 cols */}
          <div className="col-span-12 space-y-6 lg:col-span-7">
            {/* Reorder Alerts */}
            {reorderAlerts.length > 0 && (
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
                    {reorderAlerts.length} mục
                  </span>
                </div>
                <div className="space-y-3 p-6">
                  {reorderAlerts.slice(0, 5).map((alert) => (
                    <div
                      key={`${String(alert.ingredient_id)}-${String(alert.branch_id)}`}
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
                          {alert.ingredient_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            {alert.ingredient_name}
                          </p>
                          <p
                            className="text-xs"
                            style={{
                              color: "var(--md-on-surface-variant)",
                              opacity: 0.6,
                            }}
                          >
                            Tồn kho: {alert.current_quantity} {alert.unit} |
                            Ngưỡng: {alert.reorder_point} {alert.unit}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={
                          showProcurement
                            ? "/inventory/purchase-orders/new"
                            : "/inventory/stock"
                        }
                        className="text-xs font-medium hover:underline"
                        style={{ color: "var(--md-primary)" }}
                      >
                        Tạo PO ngay
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expiry Alerts */}
            {expiryAlerts.length > 0 && (
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
                    style={{
                      color: "var(--md-on-surface-variant)",
                      opacity: 0.6,
                    }}
                  >
                    Trong 7 ngày tới
                  </span>
                </div>
                <div className="space-y-3 p-6">
                  {expiryAlerts.slice(0, 4).map((item) => (
                    <div
                      key={`${String(item.ingredient_id)}-${item.batch_number ?? ""}`}
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
                          {item.ingredient_name}
                          {item.batch_number ? ` – ${item.batch_number}` : ""}
                        </h4>
                        <div className="mt-1 flex items-center gap-3">
                          <span
                            className="text-xs font-medium"
                            style={{ color: "var(--md-on-surface-variant)" }}
                          >
                            Hạn dùng: {item.expiry_date}
                          </span>
                          <StatusBadge
                            status={item.urgency}
                            label={
                              item.days_remaining <= 0
                                ? `Quá ${String(Math.abs(item.days_remaining))} ngày`
                                : `Còn ${String(item.days_remaining)} ngày`
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Operations — 5 cols */}
          <div className="col-span-12 space-y-6 lg:col-span-5">
            {/* Transfers — vertical timeline */}
            {inTransitTransfers.length > 0 && (
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
                  className="relative space-y-6 pl-6"
                  style={{
                    borderLeft: `2px solid var(--md-secondary-container)`,
                  }}
                >
                  {inTransitTransfers.slice(0, 4).map((t, i) => (
                    <Link
                      href={`/inventory/transfers/${String(t.id)}`}
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
                          <p className="text-xs font-semibold">
                            {t.transfer_number}
                          </p>
                          <p
                            className="text-xs"
                            style={{
                              color: "var(--md-on-surface-variant)",
                              opacity: 0.6,
                            }}
                          >
                            {t.from_branch_name} → {t.to_branch_name}
                          </p>
                        </div>
                        <StatusBadge status="in_transit" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Stocktake Status */}
            {activeStocktakes.length > 0 && (
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
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor: "var(--md-primary-fixed)",
                      color: "var(--md-primary)",
                    }}
                  >
                    {activeStocktakes.length}
                  </span>
                </h3>
                <div className="space-y-4">
                  {activeStocktakes.map((s) => (
                    <Link
                      href={`/inventory/stocktake/${String(s.id)}`}
                      key={s.id}
                      className="block"
                    >
                      <div className="mb-1.5 flex items-end justify-between">
                        <span className="text-xs font-medium">
                          {s.branchName}
                        </span>
                        {s.progress != null && (
                          <span
                            className="text-xs font-bold"
                            style={{ color: "var(--md-tertiary)" }}
                          >
                            {s.progress}%
                          </span>
                        )}
                      </div>
                      {s.progress != null && (
                        <div
                          className="h-1.5 w-full overflow-hidden rounded-full"
                          style={{
                            backgroundColor: "var(--md-surface-container)",
                          }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${String(s.progress)}%`,
                              backgroundColor: "var(--md-tertiary)",
                            }}
                          />
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            icon: <ShoppingCart className="size-7" />,
            label: "Nhập kho",
            href: "/inventory/receiving",
            hoverBg: "var(--md-primary-fixed)",
            show: showProcurement,
          },
          {
            icon: <Package className="size-7" />,
            label: "Tồn kho",
            href: "/inventory/stock",
            hoverBg: "var(--md-surface-highest)",
            show: true,
          },
          {
            icon: <CheckSquare className="size-7" />,
            label: "Kiểm kê",
            href: "/inventory/stocktake",
            hoverBg: "var(--md-secondary-container)",
            show: true,
          },
          {
            icon: <Truck className="size-7" />,
            label: "Luân chuyển",
            href: "/inventory/transfers",
            hoverBg: "var(--md-tertiary-container)",
            show: true,
          },
          {
            icon: <BarChart3 className="size-7" />,
            label: "Báo cáo",
            href: "/inventory/reports",
            hoverBg: "var(--md-surface-highest)",
            show: true,
          },
        ]
          .filter((a) => a.show)
          .map((action) => (
            <QuickNavCard
              key={action.label}
              href={action.href}
              icon={action.icon}
              label={action.label}
              hoverBg={action.hoverBg}
            />
          ))}
      </div>
    </div>
  );
}

function QuickNavCard({
  href,
  icon,
  label,
  hoverBg,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hoverBg: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      className="group relative flex h-32 flex-col justify-between overflow-hidden rounded-2xl p-6 ambient-shadow transition-colors duration-300"
      style={{
        backgroundColor: hovered ? hoverBg : "var(--md-surface-lowest)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="transition-transform group-hover:scale-110"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        {icon}
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}
