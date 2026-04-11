"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  MoreHorizontal,
  Pencil,
  Search,
  Wallet,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatusBadge } from "../_components/shared";
import { formatVND, formatQty } from "../_lib/format";

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

// Category → icon bg color mapping
const categoryColors: Record<string, string> = {
  Thịt: "var(--md-error-container)",
  Gạo: "var(--md-primary-fixed)",
  "Gia vị": "var(--md-secondary-container)",
  "Rau củ": "var(--md-secondary-container)",
  Trứng: "var(--md-primary-fixed)",
  "Chế biến": "var(--md-surface-high)",
  Dầu: "var(--md-surface-high)",
};

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "in_stock", label: "Còn hàng" },
  { value: "low", label: "Sắp hết" },
  { value: "out", label: "Hết hàng" },
];

export function StockClient({
  ingredients,
}: {
  ingredients: StockIngredient[];
}) {
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [viewMode, setViewMode] = useState<"stats" | "detail">("stats");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Quản lý Tồn kho
          </h2>
        </div>
        <div
          className="flex rounded-xl p-1"
          style={{ backgroundColor: "var(--md-surface-low)" }}
        >
          <button
            type="button"
            onClick={() => setViewMode("stats")}
            className="rounded-full px-4 py-2 text-xs font-semibold transition-colors"
            style={
              viewMode === "stats"
                ? {
                    backgroundColor: "white",
                    color: "var(--md-primary)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }
                : { color: "var(--md-outline)" }
            }
          >
            Thống kê
          </button>
          <button
            type="button"
            onClick={() => setViewMode("detail")}
            className="rounded-full px-4 py-2 text-xs font-semibold transition-colors"
            style={
              viewMode === "detail"
                ? {
                    backgroundColor: "white",
                    color: "var(--md-primary)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }
                : { color: "var(--md-outline)" }
            }
          >
            Chi tiết
          </button>
        </div>
      </div>

      {/* Bento Grid: Hero + Filters/Alerts */}
      <div className="grid grid-cols-12 gap-6">
        {/* Inventory Value Hero Card */}
        <div
          className="group relative col-span-12 flex flex-col justify-between overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:col-span-4"
          style={{
            background:
              "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
          }}
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
              Cập nhật: 10:24 AM Hôm nay
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <div className="flex-1 rounded-2xl bg-white/10 p-3 backdrop-blur-md">
              <div className="text-label font-semibold uppercase opacity-60">
                Tháng này
              </div>
              <div className="text-lg font-bold">+12%</div>
            </div>
            <div className="flex-1 rounded-2xl bg-white/10 p-3 backdrop-blur-md">
              <div className="text-label font-semibold uppercase opacity-60">
                Lượt nhập
              </div>
              <div className="text-lg font-bold">24</div>
            </div>
          </div>
        </div>

        {/* Filters & Alert */}
        <div className="col-span-12 grid grid-cols-2 gap-4 lg:col-span-8">
          {/* Category Filter Pills */}
          <div
            className="flex flex-col justify-center rounded-3xl p-6"
            style={{ backgroundColor: "var(--md-surface-low)" }}
          >
            <div
              className="mb-4 text-xs font-semibold uppercase"
              style={{ color: "var(--md-outline)" }}
            >
              Phân loại nhanh
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className="rounded-full px-4 py-2 text-xs font-semibold transition-colors"
                  style={
                    activeCategory === cat
                      ? {
                          backgroundColor: "var(--md-primary)",
                          color: "var(--md-on-primary)",
                        }
                      : {
                          backgroundColor: "white",
                          color: "var(--md-on-surface)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                        }
                  }
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Low Stock Alert */}
          <div
            className="relative flex flex-col justify-center overflow-hidden rounded-3xl p-6"
            style={{ backgroundColor: "var(--md-surface-low)" }}
          >
            <div
              className="mb-2 text-xs font-semibold uppercase"
              style={{ color: "var(--md-outline)" }}
            >
              Cảnh báo tồn kho
            </div>
            <div className="flex items-end gap-2">
              <span
                className="text-3xl font-extrabold"
                style={{ color: "var(--md-error)" }}
              >
                {String(lowCount).padStart(2, "0")}
              </span>
              <span
                className="mb-1.5 border-b pb-0.5 text-xs font-medium"
                style={{
                  color: "var(--md-on-surface-variant)",
                  borderColor:
                    "color-mix(in srgb, var(--md-error) 20%, transparent)",
                }}
              >
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
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        {/* Table Header Bar */}
        <div
          className="flex items-center justify-between border-b px-8 py-6"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <h3 className="text-lg font-bold">Danh sách nguyên vật liệu</h3>
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2 text-xs font-semibold"
              style={{ color: "var(--md-outline)" }}
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: "var(--md-error)" }}
              />
              Hết/Sắp hết
            </div>
            <div
              className="flex items-center gap-2 text-xs font-semibold"
              style={{ color: "var(--md-outline)" }}
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: "var(--md-tertiary)" }}
              />
              Reorder
            </div>
          </div>
        </div>

        {/* Search + Stock Filter Bar */}
        <div
          className="flex flex-wrap items-center gap-3 border-b px-8 py-3"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <Search
            className="size-4 shrink-0"
            style={{ color: "var(--md-outline)" }}
          />
          <input
            type="text"
            placeholder="Tìm kiếm tên/SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-[var(--md-outline)]"
          />
          <div className="flex items-center gap-1">
            {stockFilterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStockFilter(opt.value)}
                className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                style={
                  stockFilter === opt.value
                    ? {
                        backgroundColor: "var(--md-primary)",
                        color: "var(--md-on-primary)",
                      }
                    : {
                        backgroundColor: "var(--md-surface-low)",
                        color: "var(--md-on-surface-variant)",
                      }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            {filtered.length} nguyên liệu
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                }}
              >
                <TableHead
                  className="px-8 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Nguyên liệu
                </TableHead>
                <TableHead
                  className="px-4 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  SKU
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-center whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Đơn vị
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Tồn hiện tại
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Giá TB (WAC)
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Giá trị
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-center whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Min / Max
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-center whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Kiểm kê cuối
                </TableHead>
                <TableHead
                  className="px-8 py-4 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className="group transition-colors"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <TableCell className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-10 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor:
                            item.status === "low" || item.status === "out"
                              ? "color-mix(in srgb, var(--md-error-container) 30%, transparent)"
                              : (categoryColors[item.category] ??
                                "var(--md-surface-high)"),
                        }}
                      >
                        <span
                          className="text-sm font-bold"
                          style={{
                            color:
                              item.status === "low" || item.status === "out"
                                ? "var(--md-error)"
                                : "var(--md-on-surface-variant)",
                          }}
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
                  <TableCell
                    className="px-4 py-5 font-mono text-xs"
                    style={{ color: "var(--md-outline)" }}
                  >
                    {item.sku}
                  </TableCell>
                  <TableCell
                    className="px-4 py-5 text-center text-sm font-medium"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {item.unit}
                  </TableCell>
                  <TableCell
                    className="px-4 py-5 text-right font-mono text-sm tabular-nums"
                    style={{
                      color:
                        item.status === "low" || item.status === "out"
                          ? "var(--md-error)"
                          : undefined,
                      fontWeight:
                        item.status === "low" || item.status === "out"
                          ? 900
                          : 600,
                    }}
                  >
                    {formatQty(item.qty)}
                  </TableCell>
                  <TableCell
                    className="px-4 py-5 text-right font-mono text-sm tabular-nums"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {formatVND(item.cost)}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-right font-mono text-sm font-semibold tabular-nums">
                    {formatVND(item.qty * item.cost)}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-label font-bold"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--md-error) 10%, transparent)",
                          color: "var(--md-error)",
                        }}
                      >
                        {item.min}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--md-outline)" }}
                      >
                        /
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-label font-bold"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--md-secondary) 10%, transparent)",
                          color: "var(--md-secondary)",
                        }}
                      >
                        {item.max}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell
                    className="px-4 py-5 text-center text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {item.lastCount}
                  </TableCell>
                  <TableCell className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        className="rounded-full p-1.5 transition-colors"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        <Eye className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-1.5 transition-colors"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-1.5 transition-colors"
                        style={{ color: "var(--md-on-surface-variant)" }}
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
        <div
          className="flex items-center justify-between border-t px-8 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            Hiển thị {filtered.length} / {ingredients.length} nguyên liệu
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: "var(--md-outline-variant)",
                color: "var(--md-outline)",
              }}
            >
              ← Trước
            </button>
            <span
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: "var(--md-primary)" }}
            >
              1
            </span>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors"
              style={{ color: "var(--md-outline)" }}
            >
              2
            </button>
            <button
              type="button"
              className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: "var(--md-outline-variant)",
                color: "var(--md-outline)",
              }}
            >
              Sau →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
