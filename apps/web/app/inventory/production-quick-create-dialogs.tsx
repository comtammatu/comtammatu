"use client";

import { useEffect, useTransition, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { createIngredient } from "./actions";
import type {
  FinishedGoodOption,
  RawIngredientOption,
} from "./production-types";

interface QuickFinishedGoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (good: FinishedGoodOption) => void;
}

export function QuickFinishedGoodDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickFinishedGoodDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("Bếp trung tâm");
  const [storageType, setStorageType] = useState("ambient");

  useEffect(() => {
    if (open) return;
    setError(null);
    setName("");
    setUnit("");
    setCategory("Bếp trung tâm");
    setStorageType("ambient");
  }, [open]);

  function handleSubmit() {
    startTransition(async () => {
      setError(null);
      const trimmedName = name.trim();
      const trimmedUnit = unit.trim();
      const trimmedCategory = category.trim();

      const result = await createIngredient({
        name: trimmedName,
        purchase_unit: trimmedUnit,
        measure_unit: trimmedUnit,
        category: trimmedCategory || undefined,
        item_kind: "finished_good",
        storage_type: storageType as "ambient" | "refrigerated" | "frozen",
        min_stock_level: 0,
      });

      if (!result.success) {
        setError(result.error ?? "Không thể tạo thành phẩm");
        return;
      }

      const createdId = Number(
        (result.data as { id?: number | string } | null)?.id,
      );

      if (!Number.isFinite(createdId) || createdId <= 0) {
        setError("Đã tạo thành phẩm nhưng không đọc được mã mới.");
        return;
      }

      onCreated?.({
        id: createdId,
        name: trimmedName,
        unit: trimmedUnit,
      });
      toast.success("Đã thêm thành phẩm mới");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm thành phẩm mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Danh sách trong BOM sản xuất lấy từ danh mục nguyên liệu có loại
            <strong> Thành phẩm</strong>. Tạo mới ở đây để dùng ngay cho công
            thức.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodName">Tên thành phẩm</Label>
              <Input
                id="quickFinishedGoodName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Sườn nướng sơ chế"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodUnit">Đơn vị</Label>
              <Input
                id="quickFinishedGoodUnit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="khay, kg, lít..."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodCategory">Danh mục</Label>
              <Input
                id="quickFinishedGoodCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Bếp trung tâm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodStorage">Kiểu lưu trữ</Label>
              <Select value={storageType} onValueChange={setStorageType}>
                <SelectTrigger id="quickFinishedGoodStorage">
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

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isPending || name.trim().length === 0 || unit.trim().length === 0
            }
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Tạo thành phẩm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuickRawIngredientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (ingredient: RawIngredientOption) => void;
}

export function QuickRawIngredientDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickRawIngredientDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("Nguyên liệu sản xuất");
  const [storageType, setStorageType] = useState("ambient");

  useEffect(() => {
    if (open) return;
    setError(null);
    setName("");
    setUnit("");
    setCategory("Nguyên liệu sản xuất");
    setStorageType("ambient");
  }, [open]);

  function handleSubmit() {
    startTransition(async () => {
      setError(null);
      const trimmedName = name.trim();
      const trimmedUnit = unit.trim();
      const trimmedCategory = category.trim();

      const result = await createIngredient({
        name: trimmedName,
        purchase_unit: trimmedUnit,
        measure_unit: trimmedUnit,
        category: trimmedCategory || undefined,
        item_kind: "raw_material",
        storage_type: storageType as "ambient" | "refrigerated" | "frozen",
        min_stock_level: 0,
      });

      if (!result.success) {
        setError(result.error ?? "Không thể tạo nguyên liệu");
        return;
      }

      const createdId = Number(
        (result.data as { id?: number | string } | null)?.id,
      );

      if (!Number.isFinite(createdId) || createdId <= 0) {
        setError("Đã tạo nguyên liệu nhưng không đọc được mã mới.");
        return;
      }

      onCreated?.({
        id: createdId,
        name: trimmedName,
        unit: trimmedUnit,
      });
      toast.success("Đã thêm nguyên liệu mới");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm nguyên liệu mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tạo nhanh nguyên liệu đầu vào để hoàn thiện BOM và chuẩn bị cho
            lệnh sản xuất.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientName">Tên nguyên liệu</Label>
              <Input
                id="quickRawIngredientName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Nước mắm pha"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientUnit">Đơn vị</Label>
              <Input
                id="quickRawIngredientUnit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kg, lít, chai..."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientCategory">Danh mục</Label>
              <Input
                id="quickRawIngredientCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Nguyên liệu sản xuất"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientStorage">Kiểu lưu trữ</Label>
              <Select value={storageType} onValueChange={setStorageType}>
                <SelectTrigger id="quickRawIngredientStorage">
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

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isPending || name.trim().length === 0 || unit.trim().length === 0
            }
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Tạo nguyên liệu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
