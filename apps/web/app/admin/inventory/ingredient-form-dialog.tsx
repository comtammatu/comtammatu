"use client";

import { useState, useTransition, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Dialog,
  DialogContent,
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
import { createIngredient, updateIngredient } from "./actions";
import type { IngredientRow } from "./page";

interface IngredientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientRow | null;
  onSaved: (saved: IngredientRow) => void;
}

function IngredientFormContent({
  ingredient,
  onOpenChange,
  onSaved,
}: {
  ingredient: IngredientRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: IngredientRow) => void;
}) {
  const isEdit = ingredient !== null;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storageType, setStorageType] = useState<string>(
    ingredient?.storage_type ?? "ambient",
  );

  useEffect(() => {
    setStorageType(ingredient?.storage_type ?? "ambient");
    setError(null);
  }, [ingredient]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const raw = {
      name: fd.get("name") as string,
      unit: fd.get("unit") as string,
      sku: (fd.get("sku") as string) || undefined,
      unit_cost: fd.get("unit_cost") ? Number(fd.get("unit_cost")) : undefined,
      category: (fd.get("category") as string) || undefined,
      storage_type: storageType as "ambient" | "refrigerated" | "frozen",
      min_stock_level: fd.get("min_stock_level")
        ? Number(fd.get("min_stock_level"))
        : undefined,
      max_stock_level: fd.get("max_stock_level")
        ? Number(fd.get("max_stock_level"))
        : undefined,
      reorder_point: fd.get("reorder_point")
        ? Number(fd.get("reorder_point"))
        : undefined,
      shelf_life_days: fd.get("shelf_life_days")
        ? Number(fd.get("shelf_life_days"))
        : undefined,
    };

    startTransition(async () => {
      setError(null);
      if (isEdit) {
        const result = await updateIngredient(ingredient.id, raw);
        if (!result.success) {
          setError(result.error ?? "Đã xảy ra lỗi");
          return;
        }
        toast.success("Đã cập nhật nguyên liệu");
        onSaved({
          ...ingredient,
          name: raw.name,
          unit: raw.unit,
          sku: raw.sku ?? null,
          unit_cost: raw.unit_cost ?? null,
          category: raw.category ?? null,
          storage_type: storageType,
          min_stock_level: raw.min_stock_level ?? ingredient.min_stock_level,
          max_stock_level: raw.max_stock_level ?? null,
          reorder_point: raw.reorder_point ?? null,
          shelf_life_days: raw.shelf_life_days ?? null,
        });
      } else {
        const result = await createIngredient({
          name: raw.name,
          unit: raw.unit,
          sku: raw.sku,
          unit_cost: raw.unit_cost,
          category: raw.category,
          storage_type: storageType as "ambient" | "refrigerated" | "frozen",
          min_stock_level: raw.min_stock_level ?? 0,
          max_stock_level: raw.max_stock_level,
          reorder_point: raw.reorder_point,
          shelf_life_days: raw.shelf_life_days,
        });
        if (!result.success) {
          setError(result.error ?? "Đã xảy ra lỗi");
          return;
        }
        toast.success("Đã thêm nguyên liệu mới");
        const newId = (result.data as { id: number } | null)?.id ?? 0;
        onSaved({
          id: newId,
          name: raw.name,
          unit: raw.unit,
          sku: raw.sku ?? null,
          unit_cost: raw.unit_cost ?? null,
          category: raw.category ?? null,
          storage_type: storageType,
          min_stock_level: raw.min_stock_level ?? 0,
          max_stock_level: raw.max_stock_level ?? null,
          reorder_point: raw.reorder_point ?? null,
          shelf_life_days: raw.shelf_life_days ?? null,
          is_active: true,
        });
      }
      onOpenChange(false);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Chỉnh sửa nguyên liệu" : "Thêm nguyên liệu mới"}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: name + unit */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ing-name">Tên nguyên liệu *</Label>
            <Input
              id="ing-name"
              name="name"
              required
              defaultValue={ingredient?.name ?? ""}
              placeholder="VD: Sườn cốt lết"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-unit">Đơn vị *</Label>
            <Input
              id="ing-unit"
              name="unit"
              required
              defaultValue={ingredient?.unit ?? ""}
              placeholder="kg, lít, cái..."
            />
          </div>
        </div>

        {/* Row 2: sku + category */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ing-sku">Mã SKU</Label>
            <Input
              id="ing-sku"
              name="sku"
              defaultValue={ingredient?.sku ?? ""}
              placeholder="SKU-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-category">Danh mục</Label>
            <Input
              id="ing-category"
              name="category"
              defaultValue={ingredient?.category ?? ""}
              placeholder="Thịt, Rau củ..."
            />
          </div>
        </div>

        {/* Row 3: unit_cost + storage_type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ing-unit-cost">Giá nhập (VND)</Label>
            <Input
              id="ing-unit-cost"
              name="unit_cost"
              type="number"
              min={0}
              step={1000}
              defaultValue={ingredient?.unit_cost ?? ""}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-storage">Kiểu lưu trữ</Label>
            <Select value={storageType} onValueChange={setStorageType}>
              <SelectTrigger id="ing-storage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ambient">Thường</SelectItem>
                <SelectItem value="refrigerated">Lạnh</SelectItem>
                <SelectItem value="frozen">Đông lạnh</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 4: min / max / reorder */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ing-min">Tồn tối thiểu</Label>
            <Input
              id="ing-min"
              name="min_stock_level"
              type="number"
              min={0}
              step={0.01}
              defaultValue={ingredient?.min_stock_level ?? 0}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-max">Tồn tối đa</Label>
            <Input
              id="ing-max"
              name="max_stock_level"
              type="number"
              min={0}
              step={0.01}
              defaultValue={ingredient?.max_stock_level ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-reorder">Điểm đặt hàng</Label>
            <Input
              id="ing-reorder"
              name="reorder_point"
              type="number"
              min={0}
              step={0.01}
              defaultValue={ingredient?.reorder_point ?? ""}
            />
          </div>
        </div>

        {/* shelf_life_days */}
        <div className="space-y-2">
          <Label htmlFor="ing-shelf">Hạn sử dụng (ngày)</Label>
          <Input
            id="ing-shelf"
            name="shelf_life_days"
            type="number"
            min={1}
            step={1}
            defaultValue={ingredient?.shelf_life_days ?? ""}
            placeholder="VD: 7"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? "Cập nhật" : "Tạo mới"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function IngredientFormDialog({
  open,
  onOpenChange,
  ingredient,
  onSaved,
}: IngredientFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        key={ingredient?.id ?? "new-ingredient"}
      >
        <IngredientFormContent
          ingredient={ingredient}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
