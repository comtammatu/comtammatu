"use client";

import { useState, useTransition } from "react";
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
  DialogDescription,
} from "@comtammatu/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { adjustStock } from "./actions";

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  onAdjusted: () => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  branchId,
  ingredientId,
  ingredientName,
  unit,
  onAdjusted,
}: AdjustStockDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adjustType, setAdjustType] = useState<
    "adjustment" | "count_adjustment"
  >("adjustment");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const quantityChange = Number(fd.get("quantity_change"));
    const reason = (fd.get("reason") as string) || undefined;

    if (isNaN(quantityChange) || quantityChange === 0) {
      setError("Số lượng điều chỉnh không được bằng 0");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await adjustStock({
        branchId,
        ingredientId,
        quantityChange,
        type: adjustType,
        reason,
      });

      if (!result.success) {
        setError(result.error ?? "Đã xảy ra lỗi");
        return;
      }

      toast.success(
        quantityChange > 0
          ? `Đã nhập ${quantityChange} ${unit} ${ingredientName}`
          : `Đã xuất ${Math.abs(quantityChange)} ${unit} ${ingredientName}`,
      );
      onAdjusted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" key={`adjust-${ingredientId}`}>
        <DialogHeader>
          <DialogTitle>Điều chỉnh tồn kho</DialogTitle>
          <DialogDescription>
            Nguyên liệu:{" "}
            <span className="font-medium text-foreground">
              {ingredientName}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adjust-type" className="text-sm font-medium">
              Loại điều chỉnh
            </Label>
            <Select
              value={adjustType}
              onValueChange={(v) =>
                setAdjustType(v as "adjustment" | "count_adjustment")
              }
            >
              <SelectTrigger id="adjust-type" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adjustment">Điều chỉnh thủ công</SelectItem>
                <SelectItem value="count_adjustment">Kiểm kho</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-qty" className="text-sm font-medium">
              Số lượng ({unit}) — dương = nhập, âm = xuất
            </Label>
            <Input
              id="adjust-qty"
              name="quantity_change"
              type="number"
              step={0.01}
              required
              placeholder="VD: 10 hoặc -5"
              autoFocus
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason" className="text-sm font-medium">
              Lý do (tùy chọn)
            </Label>
            <Input
              id="adjust-reason"
              name="reason"
              placeholder="VD: Nhập hàng sáng, Hao hụt..."
              className="h-11"
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
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
