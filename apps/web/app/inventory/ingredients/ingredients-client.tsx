"use client";

import { useMemo, useState } from "react";
import { Filter, Pencil, Search } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { FilterBar, PageHeader, SearchableSelect } from "../_components/shared";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";
import { fetchIngredients } from "../actions";
import { IngredientDialog } from "./ingredient-dialog";
import type { IngredientRow } from "./ingredient-dialog";

export type { IngredientRow };

const categoryOptions = [
  { value: "all", label: "Tất cả loại" },
  { value: "Thịt", label: "Thịt" },
  { value: "Rau củ", label: "Rau củ" },
  { value: "Gia vị", label: "Gia vị" },
  { value: "Gạo", label: "Gạo" },
];

const preservationOptions = [
  { value: "all", label: "Mọi bảo quản" },
  { value: "refrigerated", label: "Mát" },
  { value: "frozen", label: "Đông" },
  { value: "ambient", label: "Khô" },
];

const categoryBorderClass: Record<string, string> = {
  Thịt: "border-l-destructive",
  Gạo: "border-l-primary",
  "Gia vị": "border-l-muted-foreground",
  "Rau củ": "border-l-success",
  Trứng: "border-l-primary",
  "Chế biến": "border-l-info",
  Dầu: "border-l-muted-foreground",
};

const categoryToneClass: Record<string, string> = {
  Thịt: "bg-destructive/12 text-destructive",
  Gạo: "bg-primary/10 text-primary",
  "Gia vị": "bg-warning/12 text-warning",
  "Rau củ": "bg-success/12 text-success",
  Trứng: "bg-primary/10 text-primary",
  "Chế biến": "bg-info/12 text-info",
  Dầu: "bg-muted text-muted-foreground",
};

function storageLabel(type: string | null): string {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return "Nhiệt độ phòng";
}

export function IngredientsClient({ initial }: { initial: IngredientRow[] }) {
  const panelClassName = "rounded-lg border bg-card shadow-sm";
  const [rows, setRows] = useState(initial);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [preservation, setPreservation] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientRow | null>(null);

  const filtered = useMemo(() => {
    let result = rows;
    if (category !== "all") {
      result = result.filter((i) => i.category === category);
    }
    if (preservation !== "all") {
      result = result.filter(
        (i) => (i.storage_type ?? "ambient") === preservation,
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.sku ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, category, preservation, searchQuery]);

  async function reload() {
    const res = await fetchIngredients();
    if (res.success) setRows((res.data ?? []) as IngredientRow[]);
  }

  function openCreate() {
    setEditingIngredient(null);
    setDialogOpen(true);
  }

  function openEdit(row: IngredientRow) {
    setEditingIngredient(row);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục Nguyên liệu"
        description="Danh mục nguyên liệu cho kho và sản xuất."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="focus-ring-standard flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:opacity-90"
          >
            + Tạo nguyên liệu
          </button>
        }
      />

      {/* Search & Filter Bar */}
      <FilterBar
        className={cn(panelClassName, "items-center bg-muted")}
        surface="inventory"
      >
        <div className="relative min-w-col-lg flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên hoặc SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="focus-ring-standard w-full rounded-xl border-none bg-card py-3 pl-12 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-3">
          <SearchableSelect
            options={categoryOptions}
            value={category}
            onValueChange={setCategory}
            placeholder="Tất cả loại"
            searchPlaceholder="Tìm loại..."
            variant="default"
            className="min-w-col-sm bg-card text-muted-foreground"
          />
          <SearchableSelect
            options={preservationOptions}
            value={preservation}
            onValueChange={setPreservation}
            placeholder="Mọi bảo quản"
            searchPlaceholder="Tìm bảo quản..."
            variant="default"
            className="min-w-col-sm bg-card text-muted-foreground"
          />
          <button
            type="button"
            className="focus-ring-standard rounded-full bg-card p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Filter className="size-4" />
          </button>
        </div>
      </FilterBar>

      {/* Asymmetric Table */}
      <div
        className={cn(
          panelClassName,
          "overflow-x-auto rounded-xl bg-card p-1",
        )}
      >
        <table className="w-full border-separate border-spacing-y-3 text-left">
          <thead>
            <tr>
              {[
                "Thông tin nguyên liệu",
                "SKU / Phân loại",
                "Đơn vị",
                "Bảo quản",
                "Giá tham chiếu",
                "Ngưỡng tồn (Min/Max/Re)",
                "",
              ].map((h) => (
                <th
                  key={h || "actions"}
                  className={`pb-4 text-label whitespace-nowrap font-bold uppercase tracking-wider text-muted-foreground ${h === "Thông tin nguyên liệu" ? "pl-6" : ""} ${!h ? "pr-6 text-right" : ""}`}
                >
                  {h || "Thao tác"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <TableEmptyStateRow
                colSpan={7}
                paddingClassName="py-16"
                title={
                  searchQuery
                    ? "Không tìm thấy nguyên liệu nào"
                    : "Chưa có nguyên liệu"
                }
                description={
                  searchQuery
                    ? "Thử từ khóa hoặc bộ lọc khác."
                    : 'Nhấn "Tạo nguyên liệu" để bắt đầu.'
                }
              />
            )}
            {filtered.map((item) => {
              const cat = item.category ?? "";
              const categoryTone =
                categoryToneClass[cat] ?? "bg-muted text-muted-foreground";
              const borderTone = categoryBorderClass[cat] ?? "border-l-border";
              const isColdStorage =
                item.storage_type === "refrigerated" ||
                item.storage_type === "frozen";

              return (
                <tr
                  key={item.id}
                  className="group transition-transform duration-200 hover:scale-[1.003]"
                >
                  {/* Name + icon + left border */}
                  <td
                    className={cn(
                      "rounded-l-2xl border-l-4 bg-background py-5 pl-6",
                      borderTone,
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "flex size-12 items-center justify-center rounded-xl text-xs font-bold",
                          categoryTone,
                        )}
                      >
                        {item.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold leading-tight">{item.name}</p>
                        <p className="text-label font-medium text-muted-foreground">
                          {item.is_active
                            ? "Đang hoạt động"
                            : "Tạm ngưng hoạt động"}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* SKU + category badge */}
                  <td className="bg-background py-5">
                    <p className="text-xs font-mono font-bold text-primary">
                      {item.sku || "—"}
                    </p>
                    {cat && (
                      <span className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-label font-bold uppercase text-muted-foreground">
                        {cat}
                      </span>
                    )}
                  </td>

                  {/* Unit */}
                  <td className="bg-background py-5 text-sm font-semibold">
                    {item.unit}
                  </td>

                  {/* Preservation */}
                  <td className="bg-background py-5">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "size-2 rounded-full",
                          isColdStorage ? "bg-info" : "bg-muted-foreground",
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isColdStorage ? "text-info" : "text-muted-foreground",
                        )}
                      >
                        {storageLabel(item.storage_type)}
                      </span>
                    </div>
                  </td>

                  {/* Reference price */}
                  <td className="bg-background py-5 text-sm font-bold">
                    {item.unit_cost ? `${formatVND(item.unit_cost)}đ` : "—"}
                  </td>

                  {/* Min / Max / Reorder badges */}
                  <td className="bg-background py-5">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-destructive/12 px-2 py-0.5 text-label font-bold text-destructive">
                        {item.min_stock_level ?? 0}
                      </span>
                      <span className="rounded bg-muted px-2 py-0.5 text-label font-bold text-muted-foreground">
                        {item.max_stock_level ?? 0}
                      </span>
                      <span className="rounded bg-success/12 px-2 py-0.5 text-label font-bold text-success">
                        {item.reorder_point ?? 0}
                      </span>
                    </div>
                  </td>

                  {/* Edit button */}
                  <td className="rounded-r-2xl bg-background py-5 pr-6 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="focus-ring-standard rounded-full p-2 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground group-focus-within:opacity-100"
                      aria-label={`Sửa ${item.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer pagination info */}
      <p className="text-center text-sm font-medium text-muted-foreground">
        Hiển thị{" "}
        <span className="font-bold text-foreground">{filtered.length}</span>{" "}
        trên tổng{" "}
        <span className="font-bold text-foreground">{rows.length}</span> nguyên
        liệu
      </p>

      {/* Create / Edit Dialog */}
      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={editingIngredient}
        onSaved={reload}
      />
    </div>
  );
}
