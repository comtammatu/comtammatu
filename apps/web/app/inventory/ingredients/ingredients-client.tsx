"use client";

import { useMemo, useState } from "react";
import { Filter, Pencil, Search } from "lucide-react";
import { PageHeader, SearchableSelect } from "../_components/shared";
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

// Left border color based on category
const categoryBorderColor: Record<string, string> = {
  Thịt: "var(--md-error)",
  Gạo: "var(--md-primary)",
  "Gia vị": "var(--md-outline-variant)",
  "Rau củ": "var(--md-secondary)",
  Trứng: "var(--md-primary)",
  "Chế biến": "var(--md-tertiary)",
  Dầu: "var(--md-outline-variant)",
};

const categoryIconBg: Record<string, string> = {
  Thịt: "color-mix(in srgb, var(--md-error-container) 50%, transparent)",
  Gạo: "color-mix(in srgb, var(--md-primary-fixed) 50%, transparent)",
  "Gia vị": "var(--md-secondary-container)",
  "Rau củ":
    "color-mix(in srgb, var(--md-secondary-container) 50%, transparent)",
  Trứng: "color-mix(in srgb, var(--md-primary-fixed) 50%, transparent)",
  "Chế biến": "color-mix(in srgb, var(--md-tertiary) 10%, transparent)",
  Dầu: "var(--md-surface-high)",
};

const categoryIconFg: Record<string, string> = {
  Thịt: "var(--md-error)",
  Gạo: "var(--md-primary)",
  "Gia vị": "var(--md-secondary)",
  "Rau củ": "var(--md-secondary)",
  Trứng: "var(--md-primary)",
  "Chế biến": "var(--md-tertiary)",
  Dầu: "var(--md-on-surface-variant)",
};

function storageLabel(type: string | null): string {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return "Nhiệt độ phòng";
}

export function IngredientsClient({ initial }: { initial: IngredientRow[] }) {
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
      <style>{`
        .toggle-track { background-color: var(--md-surface-high); }
        .peer:checked + .toggle-track { background-color: var(--md-secondary); }
      `}</style>
      <PageHeader
        title="Danh mục Nguyên liệu"
        description="Quản lý định nghĩa cơ sở cho toàn bộ hệ thống kho và sản xuất của Cơm Tấm Má Tư."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow:
                "0 4px 14px color-mix(in srgb, var(--md-primary) 25%, transparent)",
            }}
          >
            + Tạo nguyên liệu
          </button>
        }
      />

      {/* Search & Filter Bar */}
      <div
        className="flex flex-wrap items-center gap-4 rounded-2xl p-4"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="relative flex-1" style={{ minWidth: 300 }}>
          <Search
            className="absolute left-4 top-1/2 size-4 -translate-y-1/2"
            style={{ color: "var(--md-outline)" }}
          />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên hoặc SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border-none py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-0"
            style={{
              backgroundColor: "var(--md-surface-highest)",
              color: "var(--md-on-surface)",
            }}
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
            className="min-w-col-sm"
            style={{
              backgroundColor: "var(--md-surface-highest)",
              color: "var(--md-on-surface-variant)",
            }}
          />
          <SearchableSelect
            options={preservationOptions}
            value={preservation}
            onValueChange={setPreservation}
            placeholder="Mọi bảo quản"
            searchPlaceholder="Tìm bảo quản..."
            variant="default"
            className="min-w-col-sm"
            style={{
              backgroundColor: "var(--md-surface-highest)",
              color: "var(--md-on-surface-variant)",
            }}
          />
          <button
            type="button"
            className="rounded-full p-3 transition-colors hover:opacity-80"
            style={{ backgroundColor: "var(--md-surface-highest)" }}
          >
            <Filter
              className="size-4"
              style={{ color: "var(--md-on-surface-variant)" }}
            />
          </button>
        </div>
      </div>

      {/* Asymmetric Table */}
      <div className="overflow-x-auto">
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
                  className={`pb-4 ${h === "Thông tin nguyên liệu" ? "pl-6" : ""} ${!h ? "pr-6 text-right" : ""} whitespace-nowrap font-bold uppercase`}
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    color: "var(--md-outline)",
                  }}
                >
                  {h || "Thao tác"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-16 text-center text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {searchQuery
                    ? "Không tìm thấy nguyên liệu nào"
                    : 'Chưa có nguyên liệu. Nhấn "Tạo nguyên liệu" để bắt đầu.'}
                </td>
              </tr>
            )}
            {filtered.map((item) => {
              const cat = item.category ?? "";
              const borderColor =
                categoryBorderColor[cat] ?? "var(--md-outline-variant)";
              const iconBg = categoryIconBg[cat] ?? "var(--md-surface-high)";
              const iconFg =
                categoryIconFg[cat] ?? "var(--md-on-surface-variant)";

              return (
                <tr
                  key={item.id}
                  className="group transition-transform duration-200 hover:scale-[1.003]"
                >
                  {/* Name + icon + left border */}
                  <td
                    className="rounded-l-2xl py-5 pl-6"
                    style={{
                      backgroundColor: "var(--md-surface-lowest)",
                      borderLeft: `4px solid ${borderColor}`,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="flex size-12 items-center justify-center rounded-xl text-xs font-bold"
                        style={{
                          backgroundColor: iconBg,
                          color: iconFg,
                        }}
                      >
                        {item.name.charAt(0)}
                      </div>
                      <div>
                        <p
                          className="font-bold leading-tight"
                          style={{ color: "var(--md-on-surface)" }}
                        >
                          {item.name}
                        </p>
                        <p
                          className="font-medium"
                          style={{ fontSize: 11, color: "var(--md-outline)" }}
                        >
                          {item.is_active
                            ? "Đang hoạt động"
                            : "Ngừng hoạt động"}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* SKU + category badge */}
                  <td
                    className="py-5"
                    style={{ backgroundColor: "var(--md-surface-lowest)" }}
                  >
                    <p
                      className="text-xs font-mono font-bold"
                      style={{ color: "var(--md-primary)" }}
                    >
                      {item.sku || "—"}
                    </p>
                    {cat && (
                      <span
                        className="mt-1 inline-block rounded px-2 py-0.5 font-bold uppercase"
                        style={{
                          fontSize: 10,
                          backgroundColor: "var(--md-surface-high)",
                          color: "var(--md-on-surface-variant)",
                        }}
                      >
                        {cat}
                      </span>
                    )}
                  </td>

                  {/* Unit */}
                  <td
                    className="py-5 text-sm font-semibold"
                    style={{
                      backgroundColor: "var(--md-surface-lowest)",
                      color: "var(--md-on-surface)",
                    }}
                  >
                    {item.unit}
                  </td>

                  {/* Preservation */}
                  <td
                    className="py-5"
                    style={{ backgroundColor: "var(--md-surface-lowest)" }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2 rounded-full"
                        style={{
                          backgroundColor:
                            item.storage_type === "refrigerated" ||
                            item.storage_type === "frozen"
                              ? "var(--md-tertiary)"
                              : "var(--md-outline)",
                        }}
                      />
                      <span
                        className="text-sm font-medium"
                        style={{
                          color:
                            item.storage_type === "refrigerated" ||
                            item.storage_type === "frozen"
                              ? "var(--md-tertiary)"
                              : "var(--md-on-surface-variant)",
                        }}
                      >
                        {storageLabel(item.storage_type)}
                      </span>
                    </div>
                  </td>

                  {/* Reference price */}
                  <td
                    className="py-5 text-sm font-bold"
                    style={{
                      backgroundColor: "var(--md-surface-lowest)",
                      color: "var(--md-on-surface)",
                    }}
                  >
                    {item.unit_cost ? `${formatVND(item.unit_cost)}đ` : "—"}
                  </td>

                  {/* Min / Max / Reorder badges */}
                  <td
                    className="py-5"
                    style={{ backgroundColor: "var(--md-surface-lowest)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-2 py-0.5 font-bold"
                        style={{
                          fontSize: 10,
                          backgroundColor: "var(--md-error-container)",
                          color: "var(--md-on-error-container)",
                        }}
                      >
                        {item.min_stock_level ?? 0}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 font-bold"
                        style={{
                          fontSize: 10,
                          backgroundColor: "var(--md-surface-high)",
                          color: "var(--md-on-surface-variant)",
                        }}
                      >
                        {item.max_stock_level ?? 0}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 font-bold"
                        style={{
                          fontSize: 10,
                          backgroundColor: "var(--md-secondary-container)",
                          color: "var(--md-on-secondary-container)",
                        }}
                      >
                        {item.reorder_point ?? 0}
                      </span>
                    </div>
                  </td>

                  {/* Edit button */}
                  <td
                    className="rounded-r-2xl py-5 pr-6 text-right"
                    style={{ backgroundColor: "var(--md-surface-lowest)" }}
                  >
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="rounded-full p-2 opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: "var(--md-on-surface-variant)" }}
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
      <p
        className="text-center text-sm font-medium"
        style={{ color: "var(--md-outline)" }}
      >
        Hiển thị{" "}
        <span className="font-bold" style={{ color: "var(--md-on-surface)" }}>
          {filtered.length}
        </span>{" "}
        trên tổng{" "}
        <span className="font-bold" style={{ color: "var(--md-on-surface)" }}>
          {rows.length}
        </span>{" "}
        nguyên liệu
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
