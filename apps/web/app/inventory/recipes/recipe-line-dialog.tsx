"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { upsertRecipeLines } from "../procurement-actions";

export interface MenuItemOption {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

export interface RecipeLineDraft {
  ingredientId: number;
  quantity: number;
  unit: string;
  yieldFactor: number;
  note: string | null;
}

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  /** Menu item being edited. Undefined = creating a brand-new recipe. */
  editingMenuItemId?: number;
  /** Existing lines to prefill when editing. */
  editingLines?: RecipeLineDraft[];
  /** Menu item IDs that already have recipes — excluded from the create dropdown. */
  existingMenuItemIds?: number[];
  onSaved: () => void;
}

type DraftRow = {
  key: string;
  ingredientId: string;
  quantity: string;
  unit: string;
  yieldFactor: string;
  note: string;
};

let rowIdCounter = 0;
function newRowKey() {
  rowIdCounter += 1;
  return `r${rowIdCounter}`;
}

function makeEmptyRow(): DraftRow {
  return {
    key: newRowKey(),
    ingredientId: "",
    quantity: "",
    unit: "",
    yieldFactor: "1",
    note: "",
  };
}

export function RecipeLineDialog({
  open,
  onOpenChange,
  menuItems,
  ingredients,
  editingMenuItemId,
  editingLines,
  existingMenuItemIds = [],
  onSaved,
}: RecipeDialogProps) {
  const isEdit = editingMenuItemId != null;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>(
    editingMenuItemId ? String(editingMenuItemId) : "",
  );
  const [rows, setRows] = useState<DraftRow[]>(() =>
    editingLines && editingLines.length > 0
      ? editingLines.map((l) => ({
          key: newRowKey(),
          ingredientId: String(l.ingredientId),
          quantity: String(l.quantity),
          unit: l.unit,
          yieldFactor: String(l.yieldFactor),
          note: l.note ?? "",
        }))
      : [makeEmptyRow()],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedMenuItemId(editingMenuItemId ? String(editingMenuItemId) : "");
    setRows(
      editingLines && editingLines.length > 0
        ? editingLines.map((l) => ({
            key: newRowKey(),
            ingredientId: String(l.ingredientId),
            quantity: String(l.quantity),
            unit: l.unit,
            yieldFactor: String(l.yieldFactor),
            note: l.note ?? "",
          }))
        : [makeEmptyRow()],
    );
  }, [open, editingMenuItemId, editingLines]);

  const availableMenuItems = useMemo(() => {
    if (isEdit) return menuItems;
    const blocked = new Set(existingMenuItemIds);
    return menuItems.filter((mi) => !blocked.has(mi.id));
  }, [menuItems, existingMenuItemIds, isEdit]);

  const ingredientMap = useMemo(() => {
    const m = new Map<number, IngredientOption>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function handleIngredientChange(rowKey: string, value: string) {
    const ing = ingredientMap.get(Number(value));
    updateRow(rowKey, {
      ingredientId: value,
      unit:
        // Only auto-fill unit if the row hasn't got one yet.
        rows.find((r) => r.key === rowKey)?.unit || ing?.unit || "",
    });
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.key !== key),
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const menuItemId = Number(selectedMenuItemId);
    if (!menuItemId) {
      setError("Vui lòng chọn thành phẩm.");
      return;
    }

    const parsedLines: Array<{
      ingredientId: number;
      quantity: number;
      unit: string;
      yieldFactor: number;
      note: string | null;
    }> = [];
    const seen = new Set<number>();

    for (const row of rows) {
      const ingredientId = Number(row.ingredientId);
      const quantity = Number(row.quantity);
      const yieldFactor = Number(row.yieldFactor || 1);
      const unit = row.unit.trim();

      if (!ingredientId) {
        setError("Mỗi dòng phải chọn nguyên liệu.");
        return;
      }
      if (seen.has(ingredientId)) {
        setError("Nguyên liệu trùng lặp. Gộp chung vào 1 dòng.");
        return;
      }
      seen.add(ingredientId);

      if (!(quantity > 0)) {
        setError("Số lượng phải lớn hơn 0.");
        return;
      }
      if (!unit) {
        setError("Đơn vị không được để trống.");
        return;
      }
      if (!(yieldFactor > 0)) {
        setError("Yield factor phải lớn hơn 0.");
        return;
      }

      parsedLines.push({
        ingredientId,
        quantity,
        unit,
        yieldFactor,
        note: row.note.trim() ? row.note.trim() : null,
      });
    }

    if (parsedLines.length === 0) {
      setError("Công thức phải có ít nhất 1 nguyên liệu.");
      return;
    }

    startTransition(async () => {
      const result = await upsertRecipeLines({
        menuItemId,
        lines: parsedLines,
      });
      if (!result.success) {
        setError(result.error ?? "Đã xảy ra lỗi");
        return;
      }

      toast.success(
        isEdit
          ? `Đã cập nhật công thức (${parsedLines.length} nguyên liệu)`
          : `Đã tạo công thức (${parsedLines.length} nguyên liệu)`,
      );
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa công thức" : "Tạo công thức thành phẩm"}
          </DialogTitle>
          <DialogDescription>
            Công thức là định mức nguyên liệu để Bếp trung tâm sản xuất 1 phần
            thành phẩm. Mỗi thành phẩm có thể gồm nhiều nguyên liệu.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Thành phẩm *</Label>
            <Select
              value={selectedMenuItemId}
              onValueChange={setSelectedMenuItemId}
              disabled={isEdit}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Chọn thành phẩm..." />
              </SelectTrigger>
              <SelectContent>
                {availableMenuItems.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    Tất cả thành phẩm đã có công thức.
                  </div>
                ) : (
                  availableMenuItems.map((mi) => (
                    <SelectItem key={mi.id} value={String(mi.id)}>
                      {mi.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Danh sách nguyên liệu *
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
              >
                <Plus className="size-4" />
                Thêm nguyên liệu
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <div>Nguyên liệu</div>
                <div>Số lượng</div>
                <div>Đơn vị</div>
                <div>Yield</div>
                <div>Ghi chú</div>
                <div className="w-8" />
              </div>

              <div className="divide-y">
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto] items-center gap-2 px-3 py-2"
                  >
                    <Select
                      value={row.ingredientId}
                      onValueChange={(v) => handleIngredientChange(row.key, v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Chọn nguyên liệu..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ingredients.map((ing) => (
                          <SelectItem key={ing.id} value={String(ing.id)}>
                            {ing.name} ({ing.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0.001}
                      step={0.001}
                      placeholder="VD: 0.5"
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(row.key, { quantity: e.target.value })
                      }
                      className="h-9"
                    />
                    <Input
                      placeholder="kg, lít..."
                      value={row.unit}
                      onChange={(e) =>
                        updateRow(row.key, { unit: e.target.value })
                      }
                      className="h-9"
                    />
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={row.yieldFactor}
                      onChange={(e) =>
                        updateRow(row.key, { yieldFactor: e.target.value })
                      }
                      className="h-9"
                    />
                    <Input
                      placeholder="Tùy chọn"
                      value={row.note}
                      onChange={(e) =>
                        updateRow(row.key, { note: e.target.value })
                      }
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length <= 1}
                      aria-label="Xoá dòng"
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Yield mặc định 1.0 (không hao hụt). 0.85 = hao 15% khi chế biến.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-10"
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending} className="h-10">
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Cập nhật công thức" : "Lưu công thức"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
