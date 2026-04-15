"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  MoreHorizontal,
  Pencil,
  Search,
  Wallet,
} from "lucide-react";
import { cn, getSurfacePanelClassName } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { PageHeader, StatusBadge } from "../_components/shared";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND, formatQty } from "../_lib/format";
import { AdjustStockDialog } from "./adjust-stock-dialog";

export type StockIngredient = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  category: string;
  qty: number;
  cost: number;
  min: number;
  max: number;
  reorder: number;
  status: "normal" | "low" | "out" | "over";
  lastCount: string;
  temp: string | null;
};

type StockFilter = "all" | "in_stock" | "low" | "out";

const categoryClasses: Record<string, string> = {
  Thịt: "bg-destructive/12 text-destructive",
  Gạo: "bg-primary/10 text-primary",
  "Gia vị": "bg-success/12 text-success",
  "Rau củ": "bg-success/12 text-success",
  Trứng: "bg-primary/10 text-primary",
  "Chế biến": "bg-muted text-muted-foreground",
  Dầu: "bg-muted text-muted-foreground",
};

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "in_stock", label: "Còn hàng" },
  { value: "low", label: "Sắp hết" },
  { value: "out", label: "Hết hàng" },
];

export function StockClient({
  ingredients,
  branchId,
}: {
  ingredients: StockIngredient[];
  branchId: number;
}) {
  const router = useRouter();
  const panelClassName = getSurfacePanelClassName(
    "inventory",
    "ambient-shadow",
  );
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [viewMode, setViewMode] = useState<"stats" | "detail">("stats");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );

  // Derive categories from actual data
  const categories = useMemo(() => {
    const cats = [
      ...new Set(ingredients.map((i) => i.category).filter(Boolean)),
    ];
    cats.sort();
    return ["Tất cả", ...cats];
  }, [ingredients]);

  const filtered = useMemo(() => {
    let result = ingredients;

    // Category filter
    if (activeCategory !== "Tất cả") {
      result = result.filter((i) => i.category === activeCategory);
    }

    // Stock status filter
    if (stockFilter === "in_stock") {
      result = result.filter(
        (i) => i.status === "normal" || i.status === "over",
      );
    } else if (stockFilter === "low") {
      result = result.filter((i) => i.status === "low");
    } else if (stockFilter === "out") {
      result = result.filter((i) => i.status === "out");
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q),
      );
    }

    return result;
  }, [ingredients, activeCategory, stockFilter, searchQuery]);

  const totalValue = ingredients.reduce((sum, i) => sum + i.qty * i.cost, 0);
  const lowCount = ingredients.filter(
    (i) => i.status === "low" || i.status === "out",
  ).length;
  const inStockCount = ingredients.filter(
    (i) => i.status === "normal" || i.status === "over",
  ).length;
  const updatedAtLabel = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kho hàng"
        title="Quản lý tồn kho"
        description="Giá trị tồn, cảnh báo thiếu, điều chỉnh nhanh."
        actions={
          <div className="flex rounded-xl bg-muted p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("stats")}
              className={cn(
                "rounded-full px-4",
                viewMode === "stats"
                  ? "bg-background text-primary shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Thống kê
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("detail")}
              className={cn(
                "rounded-full px-4",
                viewMode === "detail"
                  ? "bg-background text-primary shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Chi tiết
            </Button>
          </div>
        }
      />

      {/* Bento Grid: Hero + Filters/Alerts */}
      <div className="grid grid-cols-12 gap-6">
        {/* Inventory Value Hero Card */}
        <div
          className={cn(
            panelClassName,
            "group relative col-span-12 flex flex-col justify-between overflow-hidden rounded-3xl border-primary/15 bg-gradient-to-br from-primary to-primary/70 p-6 text-primary-foreground shadow-xl lg:col-span-4",
          )}
        >
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-3xl transition-all duration-500 group-hover:bg-white/20" />
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Wallet className="size-5 opacity-70" />
              <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                Tổng giá trị tồn kho
              </span>
            </div>
            <div className="mb-1 text-4xl font-extrabold leading-none tracking-tighter">
              {formatVND(totalValue)}
              <span className="ml-1 text-lg font-medium opacity-80">₫</span>
            </div>
            <div className="text-xs font-medium opacity-60">
              Cập nhật: {updatedAtLabel}
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <div className="flex-1 rounded-2xl bg-white/10 p-3 backdrop-blur-md">
              <div className="text-label font-semibold uppercase opacity-60">
                Mặt hàng
              </div>
              <div className="text-lg font-bold">{ingredients.length}</div>
            </div>
            <div className="flex-1 rounded-2xl bg-white/10 p-3 backdrop-blur-md">
              <div className="text-label font-semibold uppercase opacity-60">
                Còn hàng
              </div>
              <div className="text-lg font-bold">{inStockCount}</div>
            </div>
          </div>
        </div>

        {/* Filters & Alert */}
        <div className="col-span-12 grid grid-cols-2 gap-4 lg:col-span-8">
          {/* Category Filter Pills */}
          <div
            className={cn(
              panelClassName,
              "flex flex-col justify-center rounded-3xl bg-muted p-6",
            )}
          >
            <div className="mb-4 text-xs font-semibold uppercase text-muted-foreground">
              Phân loại nhanh
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "focus-ring-standard rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-white text-foreground shadow-sm",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Low Stock Alert */}
          <div
            className={cn(
              panelClassName,
              "relative flex flex-col justify-center overflow-hidden rounded-3xl bg-muted p-6",
            )}
          >
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Cảnh báo tồn kho
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-extrabold text-destructive">
                {String(lowCount).padStart(2, "0")}
              </span>
              <span className="mb-1.5 border-b border-destructive/20 pb-0.5 text-xs font-medium text-muted-foreground">
                Mặt hàng cần mua gấp
              </span>
            </div>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10">
              <AlertTriangle className="size-16" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div
        className={cn(panelClassName, "overflow-hidden rounded-3xl bg-card")}
      >
        {/* Table Header Bar */}
        <div className="flex items-center justify-between border-b border-border/40 px-8 py-6">
          <h3 className="text-lg font-bold">Danh sách nguyên vật liệu</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="size-3 rounded-full bg-destructive" />
              Hết/Sắp hết
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="size-3 rounded-full bg-warning" />
              Reorder
            </div>
          </div>
        </div>

        {/* Search + Stock Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border/40 px-8 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm tên/SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1">
            {stockFilterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStockFilter(opt.value)}
                className={cn(
                  "focus-ring-standard rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  stockFilter === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {filtered.length} nguyên liệu
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="px-8 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Nguyên liệu
                </TableHead>
                <TableHead className="px-4 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  SKU
                </TableHead>
                <TableHead className="px-4 py-4 text-center whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Đơn vị
                </TableHead>
                <TableHead className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tồn hiện tại
                </TableHead>
                <TableHead className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Giá TB (WAC)
                </TableHead>
                <TableHead className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Giá trị
                </TableHead>
                <TableHead className="px-4 py-4 text-center whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Min / Max
                </TableHead>
                <TableHead className="px-4 py-4 text-center whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Kiểm kê cuối
                </TableHead>
                <TableHead className="px-8 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={9}
                  paddingClassName="py-16"
                  title={
                    searchQuery.trim()
                      ? "Không tìm thấy nguyên liệu phù hợp"
                      : "Chưa có dữ liệu tồn kho"
                  }
                  description={
                    searchQuery.trim()
                      ? "Thử từ khóa hoặc bộ lọc khác."
                      : "Dữ liệu tồn kho sẽ xuất hiện khi có nguyên liệu và giao dịch phát sinh."
                  }
                />
              )}
              {filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className="group border-border/40 transition-colors"
                >
                  <TableCell className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl",
                          item.status === "low" || item.status === "out"
                            ? "bg-destructive/12"
                            : (categoryClasses[item.category] ??
                                "bg-muted text-muted-foreground"),
                        )}
                      >
                        <span
                          className={cn(
                            "text-sm font-bold",
                            item.status === "low" || item.status === "out"
                              ? "text-destructive"
                              : "text-current",
                          )}
                        >
                          {item.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{item.name}</div>
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-5 font-mono text-xs text-muted-foreground">
                    {item.sku}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-center text-sm font-medium text-muted-foreground">
                    {item.unit}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "px-4 py-5 text-right font-mono text-sm tabular-nums",
                      item.status === "low" || item.status === "out"
                        ? "font-black text-destructive"
                        : "font-semibold",
                    )}
                  >
                    {formatQty(item.qty)}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {formatVND(item.cost)}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-right font-mono text-sm font-semibold tabular-nums">
                    {formatVND(item.qty * item.cost)}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-label font-bold text-destructive">
                        {item.min}
                      </span>
                      <span className="text-xs text-muted-foreground">/</span>
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-label font-bold text-success">
                        {item.max}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-5 text-center text-sm text-muted-foreground">
                    {item.lastCount}
                  </TableCell>
                  <TableCell className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setAdjustTarget(item)}
                        className="focus-ring-standard rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Điều chỉnh ${item.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustTarget(item)}
                        className="focus-ring-standard rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Thêm thao tác ${item.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/40 px-8 py-4">
          <span className="text-xs font-medium text-muted-foreground">
            Hiển thị {filtered.length} / {ingredients.length} nguyên liệu
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="focus-ring-standard rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              ← Trước
            </button>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              1
            </span>
            <button
              type="button"
              className="focus-ring-standard flex size-8 items-center justify-center rounded-full text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              2
            </button>
            <button
              type="button"
              className="focus-ring-standard rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              Sau →
            </button>
          </div>
        </div>
      </div>

      {/* Adjust Stock Dialog */}
      {adjustTarget && (
        <AdjustStockDialog
          open={adjustTarget !== null}
          onOpenChange={(o) => {
            if (!o) setAdjustTarget(null);
          }}
          branchId={branchId}
          ingredientId={adjustTarget.id}
          ingredientName={adjustTarget.name}
          unit={adjustTarget.unit}
          onAdjusted={() => {
            setAdjustTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
