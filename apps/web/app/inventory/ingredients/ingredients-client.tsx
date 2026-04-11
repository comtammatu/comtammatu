"use client";

import { useState } from "react";
import { Search, Filter } from "lucide-react";
import { PageHeader, SearchableSelect } from "../_components/shared";
import { formatVND } from "../_lib/format";

export type IngredientItem = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  category: string;
  cost: number;
  min: number;
  max: number;
  reorder: number;
  status: "normal" | "low" | "out" | "over";
  temp: string | null;
  updatedAt: string;
};

const categoryOptions = [
  { value: "all", label: "Tất cả loại" },
  { value: "Thịt", label: "Thịt" },
  { value: "Rau củ", label: "Rau củ" },
  { value: "Gia vị", label: "Gia vị" },
  { value: "Gạo", label: "Gạo" },
];

const preservationOptions = [
  { value: "all", label: "Mọi bảo quản" },
  { value: "Mát", label: "Mát" },
  { value: "Đông", label: "Đông" },
  { value: "Khô", label: "Khô" },
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

// Icon bg color based on category
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

export function IngredientsClient({
  ingredients,
}: {
  ingredients: IngredientItem[];
}) {
  const [category, setCategory] = useState("all");
  const [preservation, setPreservation] = useState("all");
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
              <th
                className="pb-4 pl-6 whitespace-nowrap font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--md-outline)",
                }}
              >
                Thông tin nguyên liệu
              </th>
              <th
                className="pb-4 whitespace-nowrap font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--md-outline)",
                }}
              >
                SKU / Phân loại
              </th>
              <th
                className="pb-4 whitespace-nowrap font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--md-outline)",
                }}
              >
                Đơn vị
              </th>
              <th
                className="pb-4 whitespace-nowrap font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--md-outline)",
                }}
              >
                Bảo quản
              </th>
              <th
                className="pb-4 whitespace-nowrap font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--md-outline)",
                }}
              >
                Giá tham chiếu
              </th>
              <th
                className="pb-4 whitespace-nowrap font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--md-outline)",
                }}
              >
                Ngưỡng tồn (Min/Max/Re)
              </th>
              <th
                className="pb-4 pr-6 whitespace-nowrap text-right font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--md-outline)",
                }}
              >
                Trạng thái
              </th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((item) => {
              const borderColor =
                categoryBorderColor[item.category] ??
                "var(--md-outline-variant)";
              const iconBg =
                categoryIconBg[item.category] ?? "var(--md-surface-high)";
              const iconFg =
                categoryIconFg[item.category] ?? "var(--md-on-surface-variant)";
              const updatedAgo = item.updatedAt;

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
                          Cập nhật {updatedAgo}
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
                      {item.sku}
                    </p>
                    <span
                      className="mt-1 inline-block rounded px-2 py-0.5 font-bold uppercase"
                      style={{
                        fontSize: 10,
                        backgroundColor: "var(--md-surface-high)",
                        color: "var(--md-on-surface-variant)",
                      }}
                    >
                      {item.category}
                    </span>
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
                    {item.temp ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2 rounded-full"
                          style={{ backgroundColor: "var(--md-tertiary)" }}
                        />
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--md-tertiary)" }}
                        >
                          {item.temp}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2 rounded-full"
                          style={{ backgroundColor: "var(--md-outline)" }}
                        />
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--md-on-surface-variant)" }}
                        >
                          Nhiệt độ phòng
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Reference price */}
                  <td
                    className="py-5 text-sm font-bold"
                    style={{
                      backgroundColor: "var(--md-surface-lowest)",
                      color: "var(--md-on-surface)",
                    }}
                  >
                    {formatVND(item.cost)}đ
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
                        {item.min}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 font-bold"
                        style={{
                          fontSize: 10,
                          backgroundColor: "var(--md-surface-high)",
                          color: "var(--md-on-surface-variant)",
                        }}
                      >
                        {item.max}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 font-bold"
                        style={{
                          fontSize: 10,
                          backgroundColor: "var(--md-secondary-container)",
                          color: "var(--md-on-secondary-container)",
                        }}
                      >
                        {item.reorder}
                      </span>
                    </div>
                  </td>

                  {/* Status toggle */}
                  <td
                    className="rounded-r-2xl py-5 pr-6 text-right"
                    style={{ backgroundColor: "var(--md-surface-lowest)" }}
                  >
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        defaultChecked={item.status !== "out"}
                      />
                      <div className="toggle-track h-6 w-11 rounded-full after:absolute after:inset-y-0.5 after:start-0.5 after:size-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
                    </label>
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
          1-{ingredients.length}
        </span>{" "}
        trên tổng{" "}
        <span className="font-bold" style={{ color: "var(--md-on-surface)" }}>
          {ingredients.length}
        </span>{" "}
        nguyên liệu
      </p>
    </div>
  );
}
