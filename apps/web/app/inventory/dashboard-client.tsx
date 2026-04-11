"use client";

import { useEffect, useState } from "react";
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
import { formatVND } from "./_lib/format";

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const dayNames = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];
const monthNames = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

function formatDate(d: Date) {
  return `${dayNames[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} Tháng ${monthNames[d.getMonth()]}, ${d.getFullYear()}`;
}

function formatTime(d: Date) {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h < 12 ? "SA" : "CH";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, "0")}:${m} ${period}`;
}

export type DashboardProps = {
  totalStockValue: number;
  pendingPO: number;
  activeTransfers: number;
  activeStocktakes: number;
  reorderAlerts: Array<{
    name: string;
    current: number;
    reorder: number;
    unit: string;
  }>;
  expiryAlerts: Array<{
    id: number;
    ingredientName: string;
    lot: string;
    expiryDate: string;
    daysLeft: number;
    urgency: string;
  }>;
  transfers: Array<{
    id: number;
    code: string;
    fromBranch: string;
    toBranch: string;
    status: string;
  }>;
  stocktakeSessions: Array<{
    id: number;
    code: string;
    branchName: string;
    progress: number;
    status: string;
  }>;
};

export function DashboardClient({
  totalStockValue,
  pendingPO,
  activeTransfers,
  activeStocktakes,
  reorderAlerts,
  expiryAlerts,
  transfers,
  stocktakeSessions,
}: DashboardProps) {
  const now = useCurrentTime();

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div>
        <h2
          className="text-2xl font-bold tracking-tight mb-1"
          style={{ color: "var(--md-on-surface)" }}
        >
          Xin chào, Quản trị viên
        </h2>
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
        >
          <Calendar className="size-3.5 shrink-0" />
          <span className="text-sm">{formatDate(now)}</span>
          <span className="mx-1">•</span>
          <Clock className="size-3.5 shrink-0" />
          <span className="text-sm">{formatTime(now)}</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatCard
          label="Tổng giá trị tồn kho"
          value={`${formatVND(totalStockValue)}đ`}
        />
        <StatCard label="PO đang chờ" value={String(pendingPO)} />
        <StatCard label="Phiếu điều chuyển" value={String(activeTransfers)} />
        <StatCard label="Phiếu kiểm kê" value={String(activeStocktakes)} />
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
              {reorderAlerts.length === 0 && (
                <p
                  className="py-4 text-center text-sm"
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.5,
                  }}
                >
                  Không có cảnh báo tái đặt hàng
                </p>
              )}
              {reorderAlerts.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg p-3"
                  style={{ backgroundColor: "var(--md-surface)" }}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded text-sm font-semibold"
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
                    href="/inventory/purchase-orders"
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
              {expiryAlerts.length === 0 && (
                <p
                  className="py-4 text-center text-sm"
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.5,
                  }}
                >
                  Không có hàng sắp hết hạn trong 7 ngày tới
                </p>
              )}
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
                    className="rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm"
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
              Điều chuyển
            </h3>
            <div
              className="relative space-y-6 pl-6"
              style={{ borderLeft: `2px solid var(--md-secondary-container)` }}
            >
              {transfers.filter(
                (t) => t.status === "in_transit" || t.status === "confirmed",
              ).length === 0 && (
                <p
                  className="py-4 text-center text-sm"
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.5,
                  }}
                >
                  Không có phiếu điều chuyển đang vận chuyển
                </p>
              )}
              {transfers
                .filter(
                  (t) => t.status === "in_transit" || t.status === "confirmed",
                )
                .slice(0, 3)
                .map((t, i) => (
                  <Link
                    href={`/inventory/transfers/${t.code}`}
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
              Kiểm kê
            </h3>
            <div className="space-y-4">
              {stocktakeSessions.filter((s) => s.status === "in_progress")
                .length === 0 && (
                <p
                  className="py-4 text-center text-sm"
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.5,
                  }}
                >
                  Không có phiếu kiểm kê đang thực hiện
                </p>
              )}
              {stocktakeSessions
                .filter((s) => s.status === "in_progress")
                .map((s) => (
                  <Link
                    href={`/inventory/stocktake/${s.code}`}
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
            href: "/inventory/receiving",
            hoverBg: "var(--md-primary-fixed)",
          },
          {
            icon: <CheckSquare className="size-7" />,
            label: "Kiểm kê",
            href: "/inventory/stocktake",
            hoverBg: "var(--md-secondary-container)",
          },
          {
            icon: <Truck className="size-7" />,
            label: "Điều chuyển",
            href: "/inventory/transfers",
            hoverBg: "var(--md-tertiary-container)",
          },
          {
            icon: <BarChart3 className="size-7" />,
            label: "Báo cáo",
            href: "/inventory/reports",
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
