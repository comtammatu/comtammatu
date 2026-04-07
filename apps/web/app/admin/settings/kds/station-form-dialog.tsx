"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { createStation, updateStation, saveStationCategories } from "./actions";
import type { StationRow, CategoryOption } from "./stations-client";

interface StationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  station: StationRow | null;
  categories: CategoryOption[];
}

export function StationFormDialog({
  open,
  onOpenChange,
  branchId,
  station,
  categories,
}: StationFormDialogProps) {
  const isEdit = !!station;
  const action = isEdit ? updateStation : createStation;
  const [state, formAction, isFormPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(
    new Set(),
  );
  const [isSavingCategories, startCategoryTransition] = useTransition();
  const [isActive, setIsActive] = useState(true);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCategories(new Set(station?.category_ids ?? []));
      setIsActive(station?.is_active ?? true);
    }
  }, [open, station]);

  // Handle successful form submission — save categories then close
  useEffect(() => {
    if (state?.success) {
      const stationId = isEdit
        ? station?.id
        : (state.data as { id: number } | undefined)?.id;
      const cats = Array.from(selectedCategories);

      if (stationId) {
        startCategoryTransition(async () => {
          const catResult = await saveStationCategories(stationId, cats);
          if (!catResult.success) {
            toast.error(catResult.error ?? "Không thể lưu danh mục");
            return;
          }
          onOpenChange(false);
          toast.success(isEdit ? "Đã cập nhật trạm KDS" : "Đã tạo trạm KDS");
        });
      } else {
        onOpenChange(false);
        toast.success(isEdit ? "Đã cập nhật trạm KDS" : "Đã tạo trạm KDS");
      }
    }
  }, [state, isEdit, station, selectedCategories, onOpenChange]);

  const toggleCategory = (categoryId: number) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const isPending = isFormPending || isSavingCategories;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa trạm KDS" : "Thêm trạm KDS mới"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Chinh sua thong tin tram KDS"
              : "Nhap thong tin tram KDS moi"}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={station.id} />}
          <input type="hidden" name="branch_id" value={branchId} />

          <div className="space-y-2">
            <Label htmlFor="station-name">Tên trạm *</Label>
            <Input
              id="station-name"
              name="name"
              required
              defaultValue={station?.name ?? ""}
              placeholder="VD: Bep chinh, Bep phu, Nuoc"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="station-position">Thứ tự hiển thị</Label>
            <Input
              id="station-position"
              name="position"
              type="number"
              min={0}
              defaultValue={station?.position ?? 0}
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-3">
              <input
                type="hidden"
                name="is_active"
                value={isActive ? "true" : "false"}
              />
              <Switch
                id="station-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="station-active">Hoạt động</Label>
            </div>
          )}

          {/* Category assignment */}
          <div className="space-y-2">
            <Label>Danh mục món ăn</Label>
            <p className="text-xs text-muted-foreground">
              Chọn danh mục để trạm này tiếp nhận. Để trống = nhận tất cả món
              (fallback).
            </p>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Checkbox
                    checked={selectedCategories.has(cat.id)}
                    onCheckedChange={() => toggleCategory(cat.id)}
                  />
                  <span className="text-sm">{cat.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({cat.type})
                  </span>
                </label>
              ))}
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Chua co danh muc nao.
                </p>
              )}
            </div>
          </div>

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Huy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Cap nhat" : "Tao moi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
