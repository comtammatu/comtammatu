"use client";

import { useEffect, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { AppDialog } from "@/components/form";
import {
  confirmProductionOrder,
  getProductionOrderDetailsForConfirm,
} from "../production-actions";

interface ItemDetail {
  id: number;
  finished_good_id: number;
  finished_good_name: string;
  quantity: number;
  unit: string;
  recipes: {
    ingredient_id: number;
    ingredient_name: string;
    quantity: number;
    unit: string;
  }[];
}

interface OrderDetail {
  id: number;
  production_number: string;
  items: ItemDetail[];
}

interface ProductionConfirmDialogProps {
  orderId: number;
  productionNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onShortage: (shortages: any[]) => void;
}

export function ProductionConfirmDialog({
  orderId,
  productionNumber,
  open,
  onOpenChange,
  onSuccess,
  onShortage,
}: ProductionConfirmDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actualQuantities, setActualQuantities] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    if (open && orderId) {
      setIsLoading(true);
      getProductionOrderDetailsForConfirm(orderId)
        .then((res) => {
          if (res.success && res.data) {
            setDetail(res.data);
            const initial: Record<number, string> = {};
            res.data.items.forEach((item) => {
              initial[item.id] = String(item.quantity);
            });
            setActualQuantities(initial);
          } else {
            toast.error(res.error || "Không thể lấy thông tin lệnh.");
            onOpenChange(false);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setDetail(null);
      setActualQuantities({});
    }
  }, [open, orderId, onOpenChange]);

  function handleConfirm() {
    if (!detail) return;

    startTransition(async () => {
      const payload = detail.items.map((item) => {
        const val = Number(actualQuantities[item.id]);
        return {
          itemId: item.id,
          actualQuantity: isNaN(val) ? item.quantity : val,
        };
      });

      const result = await confirmProductionOrder(orderId, payload);
      if (!result.success) {
        if (
          result.errorCode === "INSUFFICIENT_STOCK" &&
          Array.isArray((result as any).meta?.shortages)
        ) {
          onOpenChange(false);
          onShortage((result as any).meta.shortages);
          toast.error(result.error || "Không đủ tồn kho.");
          return;
        }
        toast.error(result.error || "Không thể xác nhận lệnh.");
        return;
      }
      toast.success("Xác nhận lệnh sản xuất thành công.");
      onOpenChange(false);
      onSuccess();
    });
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Xác nhận sản xuất: ${productionNumber}`}
      description="Nhập số lượng thực nhận cho từng thành phẩm. Nguyên liệu sẽ bị trừ theo định mức gốc (số lượng kế hoạch)."
      contentClassName="sm:max-w-[700px]"
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Đang tải dữ liệu...
          </div>
        ) : detail ? (
          <div className="space-y-4">
            {detail.items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="font-medium text-foreground">
                      {item.finished_good_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Kế hoạch: {item.quantity} {item.unit}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Thực nhận:</span>
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      className="w-32"
                      value={actualQuantities[item.id] ?? ""}
                      onChange={(e) =>
                        setActualQuantities((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">
                      {item.unit}
                    </span>
                  </div>
                </div>

                {item.recipes.length > 0 && (
                  <div className="mt-4 rounded bg-muted/50 p-3">
                    <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      Nguyên liệu tiêu hao (Cố định theo kế hoạch)
                    </div>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {item.recipes.map((recipe) => {
                        const totalNeeded = Number(
                          (item.quantity * recipe.quantity).toFixed(3)
                        );
                        return (
                          <li
                            key={recipe.ingredient_id}
                            className="flex justify-between text-sm"
                          >
                            <span className="text-muted-foreground">
                              {recipe.ingredient_name}
                            </span>
                            <span className="font-medium">
                              {totalNeeded} {recipe.unit}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || isLoading}
          >
            {ACTIONS_VI.confirm}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
