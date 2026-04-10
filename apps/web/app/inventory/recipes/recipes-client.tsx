"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { IngredientCombobox } from "../ingredient-combobox";
import { fetchRecipes, upsertRecipe } from "../procurement-actions";
import type { IngredientRow } from "../page";
import { TableEmptyStateRow } from "../../admin/components/table-empty-state-row";

export interface MenuItemOpt {
  id: number;
  name: string;
  is_active: boolean | null;
}

export interface RecipeRow {
  id: number;
  menu_item_id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  yield_factor: number;
  note: string | null;
  menu_items: { id: number; name: string } | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

export function RecipesClient({
  initial,
  menuItems,
  ingredients,
}: {
  initial: RecipeRow[];
  menuItems: MenuItemOpt[];
  ingredients: IngredientRow[];
}) {
  const [rows, setRows] = useState(initial);
  const [menuItemId, setMenuItemId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [search, setSearch] = useState("");
  const [menuFilter, setMenuFilter] = useState("_all");
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    let items = rows;

    if (menuFilter !== "_all") {
      const mid = Number(menuFilter);
      items = items.filter((r) => r.menu_item_id === mid);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (r) =>
          (r.menu_items?.name ?? "").toLowerCase().includes(q) ||
          (r.ingredients?.name ?? "").toLowerCase().includes(q),
      );
    }

    return items;
  }, [rows, search, menuFilter]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const mid = Number(menuItemId || fd.get("menuItemId"));
    const iid = Number(ingredientId || fd.get("ingredientId"));
    if (!mid || !iid) {
      toast.error("Chọn món và nguyên liệu");
      return;
    }
    const qty = Number(fd.get("quantity"));
    const unit = String(fd.get("unit") ?? "").trim();
    if (!Number.isFinite(qty) || qty <= 0 || !unit) {
      toast.error("Kiểm tra số lượng và đơn vị");
      return;
    }
    startTransition(async () => {
      const res = await upsertRecipe({
        menuItemId: mid,
        ingredientId: iid,
        quantity: qty,
        unit,
        yieldFactor: Number(fd.get("yieldFactor")) || 1,
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không lưu được");
        return;
      }
      toast.success("Đã lưu dòng công thức");
      setMenuItemId("");
      setIngredientId("");
      const again = await fetchRecipes();
      if (again.success) setRows((again.data ?? []) as RecipeRow[]);
    });
  }

  return (
    <>
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--md-on-surface)" }}
        >
          Công thức (BOM)
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
        >
          Định mức nguyên liệu theo món. Khi đơn hàng chuyển sang hoàn thành, hệ
          thống trừ tồn theo công thức (nếu đã cấu hình).
        </p>
      </div>

      <form
        onSubmit={submit}
        className="rounded-lg border bg-muted/30 p-4 space-y-3 max-w-2xl"
      >
        <h2 className="font-semibold text-sm">Thêm / cập nhật dòng</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Món *</Label>
            <Select value={menuItemId} onValueChange={setMenuItemId} required>
              <SelectTrigger>
                <SelectValue placeholder="Chọn món" />
              </SelectTrigger>
              <SelectContent>
                {menuItems.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                    {!m.is_active && " (ẩn)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nguyên liệu *</Label>
            <IngredientCombobox
              ingredients={ingredients}
              value={ingredientId}
              onValueChange={setIngredientId}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity">Định mức</Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="any"
              min="0"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit">Đơn vị</Label>
            <Input id="unit" name="unit" required placeholder="g, ml…" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="yieldFactor">Hệ số hao hụt (%)</Label>
            <Input
              id="yieldFactor"
              name="yieldFactor"
              type="number"
              step="0.001"
              min="0"
              max="1"
              defaultValue={1}
              placeholder="1.000"
            />
            <p className="text-xs text-muted-foreground">
              VD: 15% = bỏ 15% khi sơ chế (nhập 0.85). Hệ thống tự tính lượng
              gross.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" name="note" />
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !menuItemId || !ingredientId}
        >
          {isPending ? "Đang lưu…" : "Lưu công thức"}
        </Button>
      </form>

      {/* Recipe table card */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
        }}
      >
        {/* Search + filter bar */}
        <div
          className="flex flex-wrap items-center gap-3 border-b px-4 py-3"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên món hoặc nguyên liệu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={menuFilter} onValueChange={setMenuFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Món" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tất cả món</SelectItem>
                {menuItems.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="shrink-0 text-xs text-muted-foreground">
              {filtered.length} / {rows.length}
            </span>
          </div>
        </div>

        {/* Mobile: card layout */}
        {isMobile ? (
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {search || menuFilter !== "_all"
                    ? "Không tìm thấy công thức nào"
                    : "Chưa có công thức nào"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {search || menuFilter !== "_all"
                    ? "Thử bộ lọc khác"
                    : "Thêm dòng công thức qua biểu mẫu phía trên"}
                </p>
              </div>
            )}
            {filtered.map((r) => (
              <div key={r.id} className="px-4 py-3 space-y-1">
                <p className="text-sm font-medium">
                  {r.menu_items?.name ?? `#${r.menu_item_id}`}
                  <span className="text-muted-foreground font-normal">
                    {" → "}
                    {r.ingredients?.name ?? `#${r.ingredient_id}`}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.quantity.toLocaleString("vi-VN")} {r.unit}
                  {r.yield_factor != null && r.yield_factor < 1 && (
                    <> · Hao hụt {((1 - r.yield_factor) * 100).toFixed(1)}%</>
                  )}
                  {r.note && <> · {r.note}</>}
                </p>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop: table layout */
          <Table>
            <TableHeader>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Món
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Nguyên liệu
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Định mức
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Đơn vị
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Hao hụt
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Ghi chú
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={6}
                  paddingClassName="py-16"
                  title={
                    search || menuFilter !== "_all"
                      ? "Không tìm thấy công thức nào"
                      : "Chưa có công thức nào"
                  }
                  description={
                    search || menuFilter !== "_all"
                      ? "Thử bộ lọc khác"
                      : "Thêm dòng công thức qua biểu mẫu phía trên"
                  }
                />
              )}
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="group transition-colors"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                  }}
                >
                  <TableCell
                    className="px-6 py-5 font-medium"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {r.menu_items?.name ?? `#${r.menu_item_id}`}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    {r.ingredients?.name ?? `#${r.ingredient_id}`}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-right font-mono tabular-nums">
                    {r.quantity.toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell className="px-6 py-5">{r.unit}</TableCell>
                  <TableCell className="px-6 py-5 text-right font-mono tabular-nums text-muted-foreground">
                    {r.yield_factor != null && r.yield_factor < 1
                      ? `${((1 - r.yield_factor) * 100).toFixed(1)}%`
                      : "0%"}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-muted-foreground text-sm">
                    {r.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination footer */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <span
            className="text-xs"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
          >
            {filtered.length} / {rows.length} kết quả
          </span>
        </div>
      </div>
    </>
  );
}
