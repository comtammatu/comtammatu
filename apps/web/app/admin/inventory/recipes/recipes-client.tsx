"use client";

import { useState, useTransition } from "react";
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
import { fetchRecipes, upsertRecipe } from "../procurement-actions";
import type { IngredientRow } from "../page";

interface MenuItemOpt {
  id: number;
  name: string;
  is_active: boolean | null;
}

interface RecipeRow {
  id: number;
  menu_item_id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
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
  const [isPending, startTransition] = useTransition();

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
        <h1 className="text-3xl font-bold tracking-tight">Công thức (BOM)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
            <Select
              value={ingredientId}
              onValueChange={setIngredientId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn NL" />
              </SelectTrigger>
              <SelectContent>
                {ingredients.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name} ({i.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Món</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Nguyên liệu</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider font-semibold">Định mức</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Đơn vị</TableHead>
              <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider font-semibold">Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-16 text-center"
                >
                  <p className="text-sm font-medium text-muted-foreground">Chưa có công thức nào</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Thêm dòng công thức qua biểu mẫu phía trên</p>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-medium">
                  {r.menu_items?.name ?? `#${r.menu_item_id}`}
                </TableCell>
                <TableCell>
                  {r.ingredients?.name ?? `#${r.ingredient_id}`}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {r.quantity.toLocaleString("vi-VN")}
                </TableCell>
                <TableCell>{r.unit}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {r.note ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
