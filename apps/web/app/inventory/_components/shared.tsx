"use client";

import { Check } from "lucide-react";
import { cn } from "@comtammatu/ui";

// ----------------------------------------------------------------
// StatCard — MD3 style: micro label top → value → trend bottom
// ----------------------------------------------------------------
interface StatCardProps {
  label: string;
  value: string;
  trend?: { value: string; positive: boolean };
}

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div
      className="ambient-shadow rounded-xl p-5"
      style={{ backgroundColor: "var(--md-surface-lowest)" }}
    >
      <p
        className="mb-2 text-xs font-medium uppercase tracking-wider"
        style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
      >
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
      </div>
      {trend && (
        <div
          className="mt-3 flex items-center gap-1 text-xs font-medium"
          style={{
            color: trend.positive ? "var(--md-secondary)" : "var(--md-error)",
          }}
        >
          <span>{trend.positive ? "↑" : "↓"}</span>
          <span>
            {trend.positive ? "+" : ""}
            {trend.value}
          </span>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// StatusBadge — MD3 container colors
// ----------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string }> =
  {
    draft: {
      label: "Nháp",
      bg: "var(--md-surface-high)",
      fg: "var(--md-on-surface-variant)",
    },
    confirmed: {
      label: "Đã xác nhận",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-on-secondary-container)",
    },
    confirmed_ship: {
      label: "Xác nhận giao",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-on-secondary-container)",
    },
    sent: {
      label: "Đã gửi",
      bg: "var(--md-info-container)",
      fg: "var(--md-on-info-container)",
    },
    in_transit: {
      label: "Đang vận chuyển",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-secondary)",
    },
    received: {
      label: "Đã nhận",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-on-secondary-container)",
    },
    partially_received: {
      label: "Nhận 1 phần",
      bg: "var(--md-warning-container)",
      fg: "var(--md-on-warning-container)",
    },
    completed: {
      label: "Hoàn thành",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-on-secondary-container)",
    },
    cancelled: {
      label: "Đã hủy",
      bg: "var(--md-surface-high)",
      fg: "var(--md-on-surface-variant)",
    },
    pending: {
      label: "Chờ xử lý",
      bg: "var(--md-primary-fixed)",
      fg: "var(--md-primary)",
    },
    in_progress: {
      label: "Đang thực hiện",
      bg: "var(--md-info-container)",
      fg: "var(--md-on-info-container)",
    },
    matched: {
      label: "Khớp",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-secondary)",
    },
    discrepancy: {
      label: "Chênh lệch",
      bg: "var(--md-error-container)",
      fg: "var(--md-on-error-container)",
    },
    approved: {
      label: "Đã duyệt",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-on-secondary-container)",
    },
    overdue: {
      label: "Quá hạn",
      bg: "var(--md-error-container)",
      fg: "var(--md-on-error-container)",
    },
    expired: {
      label: "Đã hết hạn",
      bg: "var(--md-error-container)",
      fg: "var(--md-on-error-container)",
    },
    critical: {
      label: "Sắp hết hạn",
      bg: "var(--md-primary-fixed)",
      fg: "var(--md-primary)",
    },
    warning: {
      label: "Theo dõi",
      bg: "var(--md-warning-container)",
      fg: "var(--md-on-warning-container)",
    },
    unpaid: {
      label: "Chưa thanh toán",
      bg: "var(--md-error-container)",
      fg: "var(--md-on-error-container)",
    },
    paid: {
      label: "Đã thanh toán",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-on-secondary-container)",
    },
    partial: {
      label: "Thanh toán 1 phần",
      bg: "var(--md-warning-container)",
      fg: "var(--md-on-warning-container)",
    },
    kitchen_use: {
      label: "Kitchen Use",
      bg: "var(--md-info-container)",
      fg: "var(--md-on-info-container)",
    },
    write_off: {
      label: "Write-off",
      bg: "var(--md-error-container)",
      fg: "var(--md-on-error-container)",
    },
    consumption: {
      label: "Consumption",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-secondary)",
    },
    normal: {
      label: "Bình thường",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-secondary)",
    },
    low: {
      label: "Sắp hết",
      bg: "var(--md-warning-container)",
      fg: "var(--md-on-warning-container)",
    },
    out: {
      label: "Hết hàng",
      bg: "var(--md-error-container)",
      fg: "var(--md-error)",
    },
    over: {
      label: "Vượt mức",
      bg: "var(--md-info-container)",
      fg: "var(--md-on-info-container)",
    },
    active: {
      label: "Hoạt động",
      bg: "var(--md-secondary-container)",
      fg: "var(--md-secondary)",
    },
    suspended: {
      label: "Tạm ngưng",
      bg: "var(--md-error-container)",
      fg: "var(--md-on-error-container)",
    },
  };

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bg: "var(--md-surface-high)",
    fg: "var(--md-on-surface-variant)",
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: config.bg, color: config.fg }}
    >
      {label ?? config.label}
    </span>
  );
}

// ----------------------------------------------------------------
// PageHeader — spec: text-2xl font-bold
// ----------------------------------------------------------------
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--md-on-surface)" }}
        >
          {title}
        </h2>
        {description && (
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="mt-3 flex items-center gap-2 sm:mt-0">{actions}</div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Simple Bar Chart (CSS-only)
// ----------------------------------------------------------------
interface BarChartData {
  label: string;
  values: { value: number; color: string }[];
}

export function SimpleBarChart({
  data,
  height = 160,
}: {
  data: BarChartData[];
  height?: number;
}) {
  const maxValue = Math.max(
    ...data.flatMap((d) => d.values.map((v) => v.value)),
  );
  const isLast = (i: number) => i === data.length - 1;
  return (
    <div
      className="flex items-end gap-3 border-b px-4 pb-4"
      style={{
        height,
        borderColor:
          "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
      }}
    >
      {data.map((item, di) => (
        <div
          key={item.label}
          className="group flex flex-1 flex-col items-center gap-1"
        >
          <div
            className="flex w-full flex-col items-center justify-end gap-1"
            style={{ height: height - 32 }}
          >
            {item.values.map((v, vi) => {
              const pct = maxValue > 0 ? (v.value / maxValue) * 100 : 0;
              return (
                <div
                  key={vi}
                  className="w-full cursor-pointer transition-all duration-200"
                  style={{
                    height: `${String(pct)}%`,
                    backgroundColor: isLast(di)
                      ? v.color
                      : `color-mix(in srgb, ${v.color} 25%, transparent)`,
                    borderRadius:
                      vi === 0
                        ? "0.5rem 0.5rem 0 0"
                        : vi === item.values.length - 1
                          ? "0 0 0.5rem 0.5rem"
                          : "0",
                    minHeight: v.value > 0 ? 4 : 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = v.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isLast(di)
                      ? v.color
                      : `color-mix(in srgb, ${v.color} 25%, transparent)`;
                  }}
                />
              );
            })}
          </div>
          <span
            className="mt-2 text-xs"
            style={{
              color: "var(--md-on-surface-variant)",
              opacity: isLast(di) ? 1 : 0.5,
              fontWeight: isLast(di) ? 700 : 400,
            }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// Trend Sparkline (SVG)
// ----------------------------------------------------------------
export function TrendSparkline({
  data,
  width = 200,
  height = 60,
  color = "var(--md-primary)",
  target,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  target?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data) * 0.9;
  const max = Math.max(...data) * 1.1;
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${String(x)},${String(y)}`;
  });
  const targetY = target ? height - ((target - min) / range) * height : null;

  const fillPath = `M${points.join(" L")} L${String(width)},${String(height)} L0,${String(height)} Z`;
  const gradientId = `sparkline-gradient-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      {targetY !== null && (
        <line
          x1={0}
          y1={targetY}
          x2={width}
          y2={targetY}
          stroke="var(--md-error)"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
      {points.length > 0 &&
        points
          .filter((_, i) => i % 3 === 0 || i === points.length - 1)
          .map((pt) => {
            const [cx, cy] = pt.split(",").map(Number);
            return <circle key={pt} cx={cx} cy={cy} r={4} fill={color} />;
          })}
    </svg>
  );
}

// ----------------------------------------------------------------
// Timeline Stepper — MD3 style with shadow glow
// ----------------------------------------------------------------
interface TimelineStep {
  label: string;
  date?: string;
  active?: boolean;
  completed?: boolean;
  icon?: string;
}

export function TimelineStepper({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className="flex size-10 items-center justify-center rounded-full text-xs font-bold transition-colors"
              style={
                step.completed
                  ? {
                      backgroundColor: "var(--md-secondary)",
                      color: "white",
                      boxShadow: "0 4px 12px rgba(44,105,78,0.3)",
                    }
                  : step.active
                    ? {
                        backgroundColor: "var(--md-primary)",
                        color: "white",
                        boxShadow: "0 4px 12px rgba(211,84,0,0.3)",
                      }
                    : {
                        backgroundColor: "var(--md-surface-high)",
                        color: "var(--md-on-surface-variant)",
                      }
              }
            >
              {step.completed ? (
                <Check className="size-4" />
              ) : (
                (step.icon ?? String(i + 1))
              )}
            </div>
            <p
              className={cn(
                "mt-1.5 text-xs font-medium",
                step.active || step.completed ? "font-bold" : "",
              )}
              style={{
                color: step.active
                  ? "var(--md-on-surface)"
                  : "var(--md-on-surface-variant)",
              }}
            >
              {step.label}
            </p>
            {step.date && (
              <p
                className="text-xs"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                {step.date}
              </p>
            )}
          </div>
          {i < steps.length - 1 && (
            <div
              className="mx-2 h-1 w-12 rounded-full sm:w-20"
              style={{
                backgroundColor: step.completed
                  ? "var(--md-secondary)"
                  : "var(--md-surface-high)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
