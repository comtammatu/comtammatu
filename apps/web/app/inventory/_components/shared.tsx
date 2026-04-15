"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { tStatus } from "../_lib/dictionary";
import { cn, getSurfacePanelClassName, type UiTone } from "@comtammatu/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@comtammatu/ui/components/command";
import {
  FilterBar as SurfaceFilterBar,
  PageHeader as SurfacePageHeader,
  StatusBadge as SurfaceStatusBadge,
} from "@/components/foundation/ui-patterns";
export type DocumentStatus =
  | "draft"
  | "confirmed"
  | "sent"
  | "in_transit"
  | "received"
  | "completed"
  | "cancelled"
  | "pending"
  | "in_progress"
  | "matched"
  | "discrepancy"
  | "approved"
  | "overdue";

export type InventorySemanticColor =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const INVENTORY_COLOR_VALUE: Record<InventorySemanticColor, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-destructive)",
  info: "var(--color-info)",
  muted: "var(--color-muted-foreground)",
};

export function resolveInventoryColorValue(
  color: InventorySemanticColor | string,
) {
  return color in INVENTORY_COLOR_VALUE
    ? INVENTORY_COLOR_VALUE[color as InventorySemanticColor]
    : color;
}

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
      className={getSurfacePanelClassName(
        "inventory",
        "ui-stat-card ui-surface-lift ambient-shadow relative overflow-hidden rounded-3xl px-5 py-5",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 via-success/60 to-warning/60" />
      <p className="mb-2 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
      </div>
      {trend && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
            trend.positive ? "text-success" : "text-destructive",
          )}
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
// SearchableSelect — Popover + Command with search & scroll
// ----------------------------------------------------------------
interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Visual variant */
  variant?: "default" | "ghost" | "pill";
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyText = "Không tìm thấy.",
  className,
  style,
  variant = "default",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "focus-ring-standard inline-flex items-center gap-1.5 text-sm font-semibold transition-colors",
            variant === "default" &&
              "rounded-xl border-none px-4 py-3 font-medium focus:outline-none focus:ring-0",
            variant === "ghost" &&
              "cursor-pointer border-none bg-transparent p-0 pr-1 focus:ring-0",
            variant === "pill" &&
              "rounded-lg border-none px-4 py-2 focus:outline-none focus:ring-0",
            className,
          )}
          style={style}
        >
          <span className={cn(!selected && "opacity-60")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 opacity-50 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="rounded-xl border border-border/70 bg-card p-0 shadow-lg"
        align="start"
        style={{
          width: "var(--radix-popover-trigger-width)",
          minWidth: 220,
        }}
      >
        <Command
          className="bg-transparent"
          filter={(value, search) => {
            const opt = options.find((o) => o.value === value);
            if (!opt) return 0;
            return opt.label.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0;
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-10 bg-transparent text-sm focus:ring-0"
          />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
              {emptyText}
            </CommandEmpty>
            <CommandGroup className="p-1">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(v) => {
                    onValueChange(v);
                    setOpen(false);
                  }}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-foreground"
                >
                  <span className="flex-1">{option.label}</span>
                  {value === option.value && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ----------------------------------------------------------------
// StatusBadge — MD3 container colors
// ----------------------------------------------------------------
const statusTones: Record<string, UiTone> = {
  draft: "neutral",
  confirmed: "success",
  sent: "info",
  in_transit: "info",
  received: "success",
  completed: "success",
  cancelled: "danger",
  pending: "warning",
  in_progress: "info",
  matched: "success",
  discrepancy: "danger",
  approved: "success",
  overdue: "danger",
  expired: "danger",
  critical: "warning",
  warning: "warning",
  kitchen_use: "info",
  write_off: "danger",
  consumption: "success",
  normal: "success",
  low: "danger",
  out: "danger",
  over: "warning",
  active: "success",
  suspended: "danger",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <SurfaceStatusBadge
      tone={statusTones[status] ?? "neutral"}
      className="font-semibold"
    >
      <span className="ui-label-short">
        {label ?? tStatus(status, "badge")}
      </span>
    </SurfaceStatusBadge>
  );
}

// ----------------------------------------------------------------
// PageHeader — spec: text-2xl font-bold
// ----------------------------------------------------------------
interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow = "Kho vận",
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={getSurfacePanelClassName(
        "inventory",
        cn(
          "ui-flow-panel relative overflow-hidden rounded-4xl border-primary/15 bg-gradient-to-br from-primary/10 via-white to-info/5 px-5 py-5 shadow-sm sm:px-6",
          className,
        ),
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -right-16 top-0 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-success/10 blur-3xl" />
      </div>
      <SurfacePageHeader
        surface="inventory"
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        className="relative z-10 gap-4"
      />
    </div>
  );
}

export function FilterBar({
  children,
  className,
  surface: _surface,
}: {
  children: React.ReactNode;
  className?: string;
  surface?: "inventory";
}) {
  return (
    <SurfaceFilterBar
      surface="inventory"
      className={cn(
        "ui-flow-panel relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-white via-background to-muted/35 shadow-sm",
        className,
      )}
    >
      {children}
    </SurfaceFilterBar>
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
              className={cn(
                "flex size-10 items-center justify-center rounded-full text-xs font-bold shadow-sm transition-colors",
                step.completed
                  ? "bg-success text-white"
                  : step.active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {step.completed ? (
                <Check className="size-4" />
              ) : (
                (step.icon ?? String(i + 1))
              )}
            </div>
            <p
              className={cn(
                "mt-1.5 max-w-20 text-center text-xs font-medium text-muted-foreground",
                step.active || step.completed
                  ? "font-bold text-foreground"
                  : "",
              )}
            >
              {step.label}
            </p>
            {step.date && (
              <p className="text-xs text-muted-foreground/70">{step.date}</p>
            )}
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "mx-2 h-1 w-12 rounded-full sm:w-20",
                step.completed ? "bg-success" : "bg-muted",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// Simple Bar Chart (CSS-only)
// ----------------------------------------------------------------
interface BarChartData {
  label: string;
  values: { value: number; color: InventorySemanticColor | string }[];
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
      className="flex items-end gap-3 border-b border-border/50 px-4 pb-4"
      style={{ height }}
    >
      {data.map((item, di) => (
        <div
          key={item.label}
          className="group flex flex-1 flex-col items-center gap-1"
        >
          {/* Stacked vertical bars (like mockup) */}
          <div
            className="flex w-full flex-col items-center justify-end gap-1"
            style={{ height: height - 32 }}
          >
            {item.values.map((v, vi) => {
              const pct = maxValue > 0 ? (v.value / maxValue) * 100 : 0;
              const color = resolveInventoryColorValue(v.color);
              return (
                <div
                  key={vi}
                  className="w-full cursor-pointer transition-[transform,filter,opacity] duration-300 hover:-translate-y-0.5 hover:brightness-110"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: isLast(di)
                      ? color
                      : `color-mix(in srgb, ${color} 25%, transparent)`,
                    borderRadius:
                      vi === 0
                        ? "0.5rem 0.5rem 0 0"
                        : vi === item.values.length - 1
                          ? "0 0 0.5rem 0.5rem"
                          : "0",
                    minHeight: v.value > 0 ? 4 : 0,
                  }}
                />
              );
            })}
          </div>
          <span
            className={cn(
              "mt-2 text-xs text-muted-foreground",
              isLast(di) ? "font-bold opacity-100" : "font-normal opacity-50",
            )}
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
  color = "primary",
  target,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: InventorySemanticColor | string;
  target?: number;
}) {
  if (data.length < 2) return null;
  const strokeColor = resolveInventoryColorValue(color);
  const gradientId = useId().replace(/:/g, "");
  const min = Math.min(...data) * 0.9;
  const max = Math.max(...data) * 1.1;
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const targetY = target ? height - ((target - min) / range) * height : null;

  // Build closed path for gradient fill area
  const fillPath = `M${points.join(" L")} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Gradient fill area */}
      <path d={fillPath} fill={`url(#${gradientId})`} />
      {/* Target line */}
      {targetY !== null && (
        <line
          x1={0}
          y1={targetY}
          x2={width}
          y2={targetY}
          stroke="var(--color-destructive)"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}
      {/* Main line */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
      {/* Data points at key positions */}
      {points.length > 0 &&
        points
          .filter((_, i) => i % 3 === 0 || i === points.length - 1)
          .map((pt) => {
            const [cx, cy] = pt.split(",").map(Number);
            return <circle key={pt} cx={cx} cy={cy} r={4} fill={strokeColor} />;
          })}
    </svg>
  );
}
