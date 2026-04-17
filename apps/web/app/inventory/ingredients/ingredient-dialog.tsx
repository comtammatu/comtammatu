"use client";

import { useState, useEffect, useTransition } from "react";
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
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { createIngredient, updateIngredient } from "../actions";

export interface IngredientRow {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  item_kind: string;
  unit_cost: number | null;
  min_stock_level: number | null;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string | null;
  shelf_life_days: number | null;
  is_active: boolean;
  updated_at: string | null;
}

interface IngredientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientRow | null;
  onSaved: () => void;
}

function IngredientFormContent({
  open,
  ingredient,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  ingredient: IngredientRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = ingredient !== null;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storageType, setStorageType] = useState<string>(
    ingredient?.storage_type ?? "ambient",
  );
  const [itemKind, setItemKind] = useState<string>(
    ingredient?.item_kind ?? "raw_material",
  );
  const [unitCost, setUnitCost] = useState("");
  const [minStockLevel, setMinStockLevel] = useState("");
  const [maxStockLevel, setMaxStockLevel] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [shelfLifeDays, setShelfLifeDays] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setStorageType(ingredient?.storage_type ?? "ambient");
    setItemKind(ingredient?.item_kind ?? "raw_material");
    setUnitCost(ingredient?.unit_cost != null ? String(ingredient.unit_cost) : "");
    setMinStockLevel(
      ingredient?.min_stock_level != null ? String(ingredient.min_stock_level) : "",
    );
    setMaxStockLevel(
      ingredient?.max_stock_level != null ? String(ingredient.max_stock_level) : "",
    );
    setReorderPoint(
      ingredient?.reorder_point != null ? String(ingredient.reorder_point) : "",
    );
    setShelfLifeDays(
      ingredient?.shelf_life_days != null ? String(ingredient.shelf_life_days) : "",
    );
    setError(null);
  }, [open, ingredient]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const raw = {
      name: fd.get("name") as string,
      unit: fd.get("unit") as string,
      sku: (fd.get("sku") as string) || undefined,
      unit_cost: unitCost ? Number(unitCost) : undefined,
      category: (fd.get("category") as string) || undefined,
      item_kind: itemKind as "raw_material" | "finished_good",
      storage_type: storageType as "ambient" | "refrigerated" | "frozen",
      min_stock_level: minStockLevel ? Number(minStockLevel) : undefined,
      max_stock_level: maxStockLevel ? Number(maxStockLevel) : undefined,
      reorder_point: reorderPoint ? Number(reorderPoint) : undefined,
      shelf_life_days: shelfLifeDays ? Number(shelfLifeDays) : undefined,
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
      } else {
        const result = await createIngredient({
          name: raw.name,
          unit: raw.unit,
          sku: raw.sku,
          unit_cost: raw.unit_cost,
          category: raw.category,
          item_kind: raw.item_kind,
          storage_type: raw.storage_type,
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
      }
      onOpenChange(false);
      onSaved();
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
            <Label htmlFor="ing-name" className="text-sm font-medium">
              Tên nguyên liệu *
            </Label>
            <Input
              id="ing-name"
              name="name"
              required
              defaultValue={ingredient?.name ?? ""}
              placeholder="VD: Sườn cốt lết"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-unit" className="text-sm font-medium">
              Đơn vị *
            </Label>
            <Input
              id="ing-unit"
              name="unit"
              required
              defaultValue={ingredient?.unit ?? ""}
              placeholder="kg, lít, cái..."
              className="h-10"
            />
          </div>
        </div>

        {/* Row 2: sku + category */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ing-sku" className="text-sm font-medium">
              Mã SKU
            </Label>
            <Input
              id="ing-sku"
              name="sku"
              defaultValue={ingredient?.sku ?? ""}
              placeholder="SKU-001"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-category" className="text-sm font-medium">
              Danh mục
            </Label>
            <Input
              id="ing-category"
              name="category"
              defaultValue={ingredient?.category ?? ""}
              placeholder="Thịt, Rau củ..."
              className="h-10"
            />
          </div>
        </div>

        {/* Row 3: unit_cost + storage_type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ing-unit-cost" className="text-sm font-medium">
              Giá nhập (VND)
            </Label>
            <FormattedNumberInput
              id="ing-unit-cost"
              value={unitCost}
              onValueChange={setUnitCost}
              maxFractionDigits={0}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-storage" className="text-sm font-medium">
              Kiểu lưu trữ
            </Label>
            <Select value={storageType} onValueChange={setStorageType}>
              <SelectTrigger id="ing-storage" className="h-10">
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

        <div className="space-y-2">
          <Label htmlFor="ing-kind" className="text-sm font-medium">
            Loại hàng
          </Label>
          <Select value={itemKind} onValueChange={setItemKind}>
            <SelectTrigger id="ing-kind" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raw_material">Nguyên liệu</SelectItem>
              <SelectItem value="finished_good">Thành phẩm</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Row 4: min / max / reorder */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ing-min" className="text-sm font-medium">
              Tồn tối thiểu
            </Label>
            <FormattedNumberInput
              id="ing-min"
              value={minStockLevel}
              onValueChange={setMinStockLevel}
              maxFractionDigits={2}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-max" className="text-sm font-medium">
              Tồn tối đa
            </Label>
            <FormattedNumberInput
              id="ing-max"
              value={maxStockLevel}
              onValueChange={setMaxStockLevel}
              maxFractionDigits={2}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ing-reorder" className="text-sm font-medium">
              Điểm đặt hàng
            </Label>
            <FormattedNumberInput
              id="ing-reorder"
              value={reorderPoint}
              onValueChange={setReorderPoint}
              maxFractionDigits={2}
              className="h-10"
            />
          </div>
        </div>

        {/* shelf_life_days */}
        <div className="space-y-2">
          <Label htmlFor="ing-shelf" className="text-sm font-medium">
            Hạn sử dụng (ngày)
          </Label>
          <FormattedNumberInput
            id="ing-shelf"
            value={shelfLifeDays}
            onValueChange={setShelfLifeDays}
            maxFractionDigits={0}
            placeholder="VD: 7"
            className="h-10"
          />
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
            {isEdit ? "Cập nhật" : "Tạo mới"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  onSaved,
}: IngredientDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        key={ingredient?.id ?? "new-ingredient"}
      >
        <IngredientFormContent
          open={open}
          ingredient={ingredient}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
