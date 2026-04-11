"use client";

import {
  FileDown,
  BarChart3,
  TrendingUp,
  ArrowLeftRight,
  Package,
  Calendar,
  Store,
  ChevronDown,
} from "lucide-react";
import {
  SimpleBarChart,
  TrendSparkline,
  PageHeader,
} from "../_components/shared";
import { formatVND } from "../_lib/format";

export type ApAgingItem = { range: string; amount: number };
export type VarianceItem = {
  name: string;
  actual: string;
  trend: "up" | "down";
};

export type ReportsProps = {
  apAging: ApAgingItem[];
  consumptionVariance: VarianceItem[];
};

// Static demo data — chart time-series not yet backed by DB
const movementSummary = [
  { month: "Th01", inbound: 85, outbound: 62, transfer: 28 },
  { month: "Th02", inbound: 92, outbound: 78, transfer: 34 },
  { month: "Th03", inbound: 78, outbound: 71, transfer: 31 },
  { month: "Th04", inbound: 45, outbound: 38, transfer: 18 },
];
const foodCostTrend = [65, 62, 68, 64, 61, 58, 63, 60, 57, 55, 59, 56];
const foodCostTarget = 60;

export function ReportsClient({ apAging, consumptionVariance }: ReportsProps) {
  const barChartData = movementSummary.map((m) => ({
    label: m.month,
    values: [
      { value: m.inbound, color: "var(--md-primary)" },
      { value: m.outbound, color: "var(--md-secondary)" },
      { value: m.transfer, color: "var(--md-tertiary)" },
    ],
  }));

  const maxAP = Math.max(...apAging.map((a) => a.amount), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hệ thống Báo cáo"
        description="Phân tích biến động kho, tiêu hao và hiệu quả vận hành chuỗi Cơm Tấm Má Tư."
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <Calendar
              className="size-4"
              style={{ color: "var(--md-primary)" }}
            />
            <span style={{ color: "var(--md-on-surface)" }}>Tháng này</span>
            <ChevronDown
              className="size-3.5"
              style={{ color: "var(--md-outline)" }}
            />
          </div>
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <Store className="size-4" style={{ color: "var(--md-primary)" }} />
            <span style={{ color: "var(--md-on-surface)" }}>
              Tất cả chi nhánh
            </span>
            <ChevronDown
              className="size-3.5"
              style={{ color: "var(--md-outline)" }}
            />
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition-all hover:opacity-90"
          style={{
            border: "2px solid var(--md-primary)",
            color: "var(--md-primary)",
            backgroundColor: "transparent",
          }}
        >
          <FileDown className="size-4" />
          Xuất CSV/Excel
        </button>
      </div>

      {/* Dashboard Grid — 12 col asymmetric */}
      <div className="grid grid-cols-12 gap-6">
        {/* Stock Movement Summary — col-span-8 */}
        <div
          className="col-span-12 lg:col-span-8 flex flex-col rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--md-primary) 10%, transparent)",
                }}
              >
                <BarChart3
                  className="size-5"
                  style={{ color: "var(--md-primary)" }}
                />
              </div>
              <h3
                className="text-lg font-bold"
                style={{ color: "var(--md-on-surface)" }}
              >
                Stock Movement Summary
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: "var(--md-primary)" }}
                />
                <span style={{ color: "var(--md-on-surface-variant)" }}>
                  Nhập kho
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: "var(--md-secondary)" }}
                />
                <span style={{ color: "var(--md-on-surface-variant)" }}>
                  Xuất kho
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: "var(--md-tertiary)" }}
                />
                <span style={{ color: "var(--md-on-surface-variant)" }}>
                  Luân chuyển
                </span>
              </span>
            </div>
          </div>
          <div className="flex-1">
            <SimpleBarChart data={barChartData} height={220} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p
              className="text-sm"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Tăng{" "}
              <span
                className="font-bold"
                style={{ color: "var(--md-secondary)" }}
              >
                +12.5%
              </span>{" "}
              so với tháng trước
            </p>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-bold hover:underline"
              style={{ color: "var(--md-primary)" }}
            >
              Chi tiết
            </button>
          </div>
        </div>

        {/* Supplier AP Aging — col-span-4 */}
        <div
          className="col-span-12 lg:col-span-4 rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <h3
            className="mb-4 text-lg font-bold"
            style={{ color: "var(--md-on-surface)" }}
          >
            Supplier AP Aging
          </h3>
          <div className="space-y-4">
            {apAging.map((item, idx) => {
              const isOverdue = idx === apAging.length - 1;
              const barColor =
                idx === 0
                  ? "var(--md-secondary)"
                  : idx === 1
                    ? "var(--md-primary)"
                    : idx === 2
                      ? "var(--md-on-warning-container)"
                      : "var(--md-error)";
              return (
                <div
                  key={item.range}
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: isOverdue
                      ? "var(--md-error-container)"
                      : "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                    border: isOverdue
                      ? "1px solid color-mix(in srgb, var(--md-error) 20%, transparent)"
                      : "none",
                  }}
                >
                  <div className="mb-1 flex justify-between text-xs">
                    <span
                      style={{
                        color: isOverdue
                          ? "var(--md-error)"
                          : "var(--md-on-surface-variant)",
                      }}
                    >
                      {item.range}
                    </span>
                    <span
                      className="font-bold"
                      style={{
                        color: isOverdue
                          ? "var(--md-on-error-container)"
                          : "var(--md-on-surface)",
                      }}
                    >
                      {formatVND(item.amount)}đ
                    </span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full"
                    style={{
                      backgroundColor: isOverdue
                        ? "color-mix(in srgb, var(--md-error) 20%, transparent)"
                        : "var(--md-surface-high)",
                    }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(item.amount / maxAP) * 100}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-6 w-full rounded-full py-2 text-sm font-semibold transition-colors hover:opacity-80"
            style={{
              border: "1px solid var(--md-outline-variant)",
              color: "var(--md-on-surface-variant)",
              backgroundColor: "transparent",
            }}
          >
            Xem danh sách NCC
          </button>
        </div>

        {/* Consumption Variance — col-span-6 */}
        <div
          className="col-span-12 md:col-span-6 rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <h3
            className="mb-2 text-lg font-bold"
            style={{ color: "var(--md-on-surface)" }}
          >
            Consumption Variance
          </h3>
          <p
            className="mb-6 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Thực tế vs Định mức Recipe
          </p>
          <div className="space-y-4">
            {consumptionVariance.map((item) => {
              const isUp = item.trend === "up";
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-2xl p-4"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                    border:
                      "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: "var(--md-surface-lowest)" }}
                    >
                      <Package
                        className="size-5"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      />
                    </div>
                    <div>
                      <p
                        className="text-sm font-bold"
                        style={{ color: "var(--md-on-surface)" }}
                      >
                        {item.name}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--md-outline)" }}
                      >
                        Đơn vị: kg
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className="text-sm font-bold"
                      style={{
                        color: isUp ? "var(--md-error)" : "var(--md-secondary)",
                      }}
                    >
                      {item.actual}
                    </p>
                    <span
                      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 font-bold"
                      style={{
                        fontSize: 10,
                        backgroundColor: isUp
                          ? "var(--md-error-container)"
                          : "var(--md-secondary-container)",
                        color: isUp
                          ? "var(--md-on-error-container)"
                          : "var(--md-on-secondary-container)",
                      }}
                    >
                      {isUp ? "Vượt định mức" : "Tiết kiệm"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Food Cost by Period — col-span-6 */}
        <div
          className="col-span-12 md:col-span-6 rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3
                className="text-lg font-bold"
                style={{ color: "var(--md-on-surface)" }}
              >
                Food Cost by Period
              </h3>
              <p
                className="text-sm"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                Trung bình: 32.4%
              </p>
            </div>
            <div
              className="flex rounded-full p-1 font-bold"
              style={{ fontSize: 10, backgroundColor: "var(--md-surface-low)" }}
            >
              <button
                type="button"
                className="rounded-full px-3 py-1 ambient-shadow"
                style={{
                  backgroundColor: "var(--md-surface-lowest)",
                  color: "var(--md-on-surface)",
                }}
              >
                Tuần
              </button>
              <button
                type="button"
                className="rounded-full px-3 py-1"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                Tháng
              </button>
            </div>
          </div>
          <TrendSparkline
            data={foodCostTrend}
            width={400}
            height={120}
            color="var(--md-primary)"
            target={foodCostTarget}
          />
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            <span style={{ color: "var(--md-error)" }}>— —</span> Mục tiêu 30%
          </p>
        </div>
      </div>

      {/* Report catalog */}
      <p
        className="text-xl font-bold"
        style={{ color: "var(--md-on-surface)" }}
      >
        Danh sách các báo cáo chi tiết
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: BarChart3,
            title: "Biến động kho chi tiết",
            desc: "Tra cứu lịch sử nhập/xuất từng mã hàng.",
          },
          {
            icon: TrendingUp,
            title: "Chênh lệch định mức",
            desc: "Phân tích hao hụt nguyên liệu theo Recipe.",
          },
          {
            icon: ArrowLeftRight,
            title: "Luân chuyển đang vận chuyển",
            desc: "Theo dõi hàng hóa đang trên đường nội bộ.",
          },
          {
            icon: Package,
            title: "Tồn kho cuối kỳ",
            desc: "Báo cáo giá trị tồn kho tại thời điểm chốt.",
          },
        ].map((report) => (
          <div
            key={report.title}
            className="group cursor-pointer rounded-xl p-5 transition-all hover:shadow-md ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            }}
          >
            <div
              className="mb-4 flex size-12 items-center justify-center rounded-full transition-colors"
              style={{ backgroundColor: "var(--md-surface-low)" }}
            >
              <report.icon
                className="size-5"
                style={{ color: "var(--md-on-surface-variant)" }}
              />
            </div>
            <p className="font-bold" style={{ color: "var(--md-on-surface)" }}>
              {report.title}
            </p>
            <p
              className="mt-0.5 text-xs"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {report.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
