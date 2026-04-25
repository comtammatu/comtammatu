"use client";

import * as React from "react";
import { Search as IconSearch } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { cn } from "@comtammatu/ui";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";
import { formatQty } from "../../_lib/format";

type StockRow = {
  ingredientId: number;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  quantity: number;
  minLevel: number;
  reorderPoint: number | null;
  maxLevel: number | null;
  status: "out" | "low" | "over" | "normal";
  branchId: number | null;
  branchName: string;
};

type Filter = "all" | "attention" | "out" | "low" | "normal";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Tất cả",
  attention: "Cần xử lý",
  out: "Hết",
  low: "Sắp hết",
  normal: "Bình thường",
};

const STATUS_STYLES: Record<
  StockRow["status"],
  { label: string; className: string; dot: string }
> = {
  out: {
    label: "Hết hàng",
    className: "bg-destructive/15 text-destructive",
    dot: "bg-destructive",
  },
  low: {
    label: "Sắp hết",
    className: "bg-warning/20 text-warning-foreground",
    dot: "bg-warning",
  },
  normal: {
    label: "Bình thường",
    className: "bg-success/15 text-success-foreground",
    dot: "bg-success",
  },
  over: {
    label: "Dư nhiều",
    className: "bg-info/15 text-info-foreground",
    dot: "bg-info",
  },
};

export function MobileStockClient({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const counts = React.useMemo(() => {
    const byStatus: Record<StockRow["status"], number> = {
      out: 0,
      low: 0,
      normal: 0,
      over: 0,
    };
    for (const r of rows) byStatus[r.status] += 1;
    return byStatus;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "out" && row.status !== "out") return false;
      if (filter === "low" && row.status !== "low") return false;
      if (filter === "normal" && row.status !== "normal") return false;
      if (
        filter === "attention" &&
        row.status !== "out" &&
        row.status !== "low"
      )
        return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        (row.sku ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, query, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <StatusSummary
          label="Hết"
          value={counts.out}
          variant="destructive"
          onClick={() => setFilter(counts.out ? "out" : "all")}
          active={filter === "out"}
        />
        <StatusSummary
          label="Sắp hết"
          value={counts.low}
          variant="warning"
          onClick={() => setFilter(counts.low ? "low" : "all")}
          active={filter === "low"}
        />
        <StatusSummary
          label="Bình thường"
          value={counts.normal}
          variant="success"
          onClick={() => setFilter("normal")}
          active={filter === "normal"}
        />
      </div>

      <InputGroup className="h-12 rounded-lg">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm nguyên liệu theo tên hoặc SKU"
          className="text-base"
          inputMode="search"
        />
      </InputGroup>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition",
              filter === key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={IconSearch}
          title="Không thấy nguyên liệu phù hợp"
          description="Thử bỏ bộ lọc hoặc dùng từ khóa khác."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((row) => {
            const style = STATUS_STYLES[row.status];
            return (
              <li
                key={`${row.ingredientId}-${row.branchId ?? "all"}`}
                className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3"
              >
                <span
                  className={cn(
                    "mt-1 block size-2.5 shrink-0 rounded-full",
                    style.dot,
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {row.name}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        style.className,
                      )}
                    >
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatQty(row.quantity)} {row.unit}
                    </span>
                    {row.minLevel > 0 ? (
                      <span>Min {formatQty(row.minLevel)}</span>
                    ) : null}
                    {row.reorderPoint != null ? (
                      <span>
                        Điểm đặt {formatQty(row.reorderPoint)}
                      </span>
                    ) : null}
                    {row.category ? <span>· {row.category}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusSummary({
  label,
  value,
  variant,
  active,
  onClick,
}: {
  label: string;
  value: number;
  variant: "destructive" | "warning" | "success";
  active: boolean;
  onClick: () => void;
}) {
  const tint =
    variant === "destructive"
      ? "border-destructive/20 bg-destructive/5 text-destructive"
      : variant === "warning"
        ? "border-warning/30 bg-warning/5 text-warning-foreground"
        : "border-success/30 bg-success/5 text-success-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition",
        tint,
        active && "ring-2 ring-offset-2 ring-offset-background",
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider">
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
    </button>
  );
}
