"use client";

import { Pencil, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "../_components/shared";
import { formatVND } from "../_lib/format";

export type RecipeItem = {
  ingredientName: string;
  qty: number;
  unit: string;
  yieldFactor: number;
  note: string | null;
};

export type RecipeRow = {
  id: number;
  name: string;
  category: string;
  updatedAt: string;
  estimatedCost: number;
  items: RecipeItem[];
};

function YieldBadge({ value }: { value: number }) {
  const bg =
    value >= 95
      ? "var(--md-secondary-container)"
      : value >= 80
        ? "color-mix(in srgb, var(--md-tertiary) 15%, transparent)"
        : "var(--md-error-container)";
  const fg =
    value >= 95
      ? "var(--md-on-secondary-container)"
      : value >= 80
        ? "var(--md-tertiary)"
        : "var(--md-on-error-container)";
  return (
    <span
      className="inline-flex items-center rounded px-2 py-1 text-xs font-bold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {value}%
    </span>
  );
}

export function RecipesClient({ recipes }: { recipes: RecipeRow[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Công thức món ăn"
        description="Thiết lập định mức nguyên vật liệu chi tiết cho từng món ăn trong menu để tối ưu hóa chi phí và quản lý kho chính xác."
        actions={
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow:
                "0 4px 14px color-mix(in srgb, var(--md-primary) 25%, transparent)",
            }}
          >
            + Tạo món mới
          </button>
        }
      />

      <div className="space-y-10">
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="overflow-hidden rounded-2xl ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            }}
          >
            {/* Recipe header */}
            <div
              className="flex items-center justify-between px-6 py-5"
              style={{ backgroundColor: "var(--md-surface-high)" }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex size-12 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-primary) 10%, transparent)",
                  }}
                >
                  <UtensilsCrossed
                    className="size-5"
                    style={{ color: "var(--md-primary)" }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      className="text-xl font-bold"
                      style={{ color: "var(--md-on-surface)" }}
                    >
                      {recipe.name}
                    </h3>
                    <span
                      className="rounded-full px-2 py-0.5 font-bold uppercase tracking-wider"
                      style={{
                        fontSize: 10,
                        backgroundColor: "var(--md-secondary-container)",
                        color: "var(--md-on-secondary-container)",
                      }}
                    >
                      {recipe.category}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    Cập nhật {recipe.updatedAt}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg p-2 transition-colors hover:opacity-80"
                  style={{ color: "var(--md-outline)" }}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors hover:opacity-80"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-primary) 10%, transparent)",
                    color: "var(--md-primary)",
                  }}
                >
                  + Thêm dòng công thức
                </button>
              </div>
            </div>

            {/* Ingredients table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                    }}
                  >
                    <th
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      Nguyên liệu
                    </th>
                    <th
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      Số lượng
                    </th>
                    <th
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      Đơn vị
                    </th>
                    <th
                      className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      Yield Factor (%)
                    </th>
                    <th
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      Ghi chú
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.items.map((item) => (
                    <tr
                      key={item.ingredientName}
                      className="transition-colors"
                      style={{
                        borderBottom:
                          "1px solid color-mix(in srgb, var(--md-surface-low) 80%, transparent)",
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor:
                                "color-mix(in srgb, var(--md-primary) 40%, transparent)",
                            }}
                          />
                          <span
                            className="font-semibold"
                            style={{ color: "var(--md-on-surface)" }}
                          >
                            {item.ingredientName}
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 font-mono"
                        style={{ color: "var(--md-on-surface)" }}
                      >
                        {item.qty}
                      </td>
                      <td
                        className="px-6 py-4"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        {item.unit}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <YieldBadge value={item.yieldFactor} />
                      </td>
                      <td
                        className="px-6 py-4 text-xs italic"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        {item.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cost estimate footer */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{
                borderTop:
                  "1px solid color-mix(in srgb, var(--md-surface-low) 80%, transparent)",
              }}
            >
              <span
                className="text-xs font-medium uppercase tracking-tight"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                Giá vốn tạm tính:{" "}
                <span
                  className="font-bold"
                  style={{ color: "var(--md-primary)" }}
                >
                  {formatVND(recipe.estimatedCost)} đ
                </span>{" "}
                / phần
              </span>
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-bold hover:underline"
                style={{ color: "var(--md-primary)" }}
              >
                Xem chi tiết biến động giá
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
