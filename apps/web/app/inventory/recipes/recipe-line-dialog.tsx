"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
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
import { upsertRecipe } from "../procurement-actions";

export interface MenuItemOption {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

export interface EditingLine {
  menuItemId: number;
  ingredientId: number;
  quantity: number;
  unit: string;
  yieldFactor: number;
  note: string | null;
}

interface RecipeLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  defaultMenuItemId?: number;
  editingLine?: EditingLine | null;
  onSaved: () => void;
}

export function RecipeLineDialog({
  open,
  onOpenChange,
  menuItems,
  ingredients,
  defaultMenuItemId,
  editingLine,
  onSaved,
}: RecipeLineDialogProps) {
  const isEdit = editingLine != null;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>(
    editingLine
      ? String(editingLine.menuItemId)
      : defaultMenuItemId
        ? String(defaultMenuItemId)
        : "",
  );
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>(
    editingLine ? String(editingLine.ingredientId) : "",
  );

  // Derive unit from selected ingredient
  const selectedIngredient = ingredients.find(
    (i) => i.id === Number(selectedIngredientId),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const menuItemId = Number(selectedMenuItemId);
    const ingredientId = Number(selectedIngredientId);
    const quantity = Number(fd.get("quantity"));
    const unit = (fd.get("unit") as string) || selectedIngredient?.unit || "";
    const yieldFactor = Number(fd.get("yield_factor") || 1.0);
    const note = (fd.get("note") as string) || undefined;

    if (!menuItemId || !ingredientId || !quantity || !unit) {
      setError("Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await upsertRecipe({
        menuItemId,
        ingredientId,
        quantity,
        unit,
        yieldFactor,
        note,
      });

      if (!result.success) {
        setError(result.error ?? "Đã xảy ra lỗi");
        return;
      }

      toast.success(
        isEdit ? "Đã cập nhật dòng công thức" : "Đã thêm dòng công thức",
      );
      onOpenChange(false);
      onSaved();
    });
  }

  const dialogKey = isEdit
    ? `edit-${editingLine.menuItemId}-${editingLine.ingredientId}`
    : `new-${defaultMenuItemId ?? "any"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" key={dialogKey}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa dòng công thức" : "Thêm dòng công thức"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật nguyên liệu và định lượng."
              : "Chọn món ăn và nguyên liệu cần thêm."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Menu item select */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Món ăn *</Label>
            <Select
              value={selectedMenuItemId}
              onValueChange={setSelectedMenuItemId}
              disabled={!!defaultMenuItemId || isEdit}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Chọn món ăn..." />
              </SelectTrigger>
              <SelectContent>
                {menuItems.map((mi) => (
                  <SelectItem key={mi.id} value={String(mi.id)}>
                    {mi.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ingredient select */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Nguyên liệu *</Label>
            <Select
              value={selectedIngredientId}
              onValueChange={setSelectedIngredientId}
              disabled={isEdit}
            >
              <SelectTrigger className="h-10">
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
          </div>

          {/* Quantity + Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recipe-qty" className="text-sm font-medium">
                Số lượng *
              </Label>
              <Input
                id="recipe-qty"
                name="quantity"
                type="number"
                min={0.001}
                step={0.001}
                required
                defaultValue={editingLine?.quantity ?? ""}
                placeholder="VD: 0.5"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-unit" className="text-sm font-medium">
                Đơn vị *
              </Label>
              <Input
                id="recipe-unit"
                name="unit"
                required
                defaultValue={
                  editingLine?.unit ?? selectedIngredient?.unit ?? ""
                }
                placeholder="kg, lít..."
                className="h-10"
              />
            </div>
          </div>

          {/* Yield factor + note */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recipe-yield" className="text-sm font-medium">
                Yield Factor
              </Label>
              <Input
                id="recipe-yield"
                name="yield_factor"
                type="number"
                min={0.01}
                max={1}
                step={0.01}
                defaultValue={editingLine?.yieldFactor ?? 1.0}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-note" className="text-sm font-medium">
                Ghi chú
              </Label>
              <Input
                id="recipe-note"
                name="note"
                defaultValue={editingLine?.note ?? ""}
                placeholder="Tùy chọn..."
                className="h-10"
              />
            </div>
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
              {isEdit ? "Cập nhật" : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
