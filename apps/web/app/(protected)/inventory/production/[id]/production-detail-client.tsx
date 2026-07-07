/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { AppSection } from "@/components/surface";
import { startProductionRun, confirmProductionRun, cancelProductionRun } from "../../production-run-actions";
import type { ProductionRunRow } from "../../production-run-actions";
import { formatVNDate } from "@comtammatu/shared/time";

interface ProductionDetailClientProps {
  run: ProductionRunRow;
}

export function ProductionDetailClient({ run }: ProductionDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actualQuantity, setActualQuantity] = useState<string>(run.actual_quantity?.toString() || "");

  const handleStart = () => {
    startTransition(async () => {
      const res = await startProductionRun(run.id);
      if (res.success) {
        toast.success("Đã bắt đầu lệnh sản xuất");
        router.refresh();
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
      }
    });
  };

  const handleConfirm = () => {
    startTransition(async () => {
      const actual = actualQuantity ? parseFloat(actualQuantity) : undefined;
      const res = await confirmProductionRun({ id: run.id, actualQuantity: actual });
      
      if (res.success) {
        toast.success("Đã xác nhận lệnh sản xuất");
        router.refresh();
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
        // TODO: Handle missing items rendering if any (res.data has shortages)
        if (res.data && Array.isArray(res.data)) {
            console.error("Shortages:", res.data);
            toast.error("Thiếu nguyên liệu trong kho để sản xuất.");
        }
      }
    });
  };

  const handleCancel = () => {
    if (!confirm("Bạn có chắc chắn muốn hủy lệnh này?")) return;
    
    startTransition(async () => {
      const res = await cancelProductionRun(run.id);
      if (res.success) {
        toast.success("Đã hủy lệnh sản xuất");
        router.refresh();
      } else {
        toast.error(res.error || "Có lỗi xảy ra");
      }
    });
  };

  const unit = run.entry_unit_name || "";

  return (
    <AppSection className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground">Chi nhánh</Label>
          <div className="font-medium">{run.branch_name}</div>
        </div>
        <div>
          <Label className="text-muted-foreground">Ngày tạo</Label>
          <div className="font-medium">{formatVNDate(run.created_at)}</div>
        </div>
        <div>
          <Label className="text-muted-foreground">Thành phẩm</Label>
          <div className="font-medium">{run.finished_good_name}</div>
        </div>
        <div>
          <Label className="text-muted-foreground">SL Dự kiến</Label>
          <div className="font-medium">{run.planned_quantity} {unit}</div>
        </div>
        {run.notes && (
          <div className="col-span-2">
            <Label className="text-muted-foreground">Ghi chú</Label>
            <div className="font-medium">{run.notes}</div>
          </div>
        )}
      </div>

      {(run.status === "draft" || run.status === "in_progress") && (
        <div className="border-t pt-4 space-y-4">
          <div className="grid gap-2 max-w-xs">
            <Label>Số lượng thực tế (tùy chọn)</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={actualQuantity}
                onChange={(e) => setActualQuantity(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>

          <div className="flex gap-2">
            {run.status === "draft" && (
              <Button onClick={handleStart} disabled={isPending}>
                Bắt đầu sản xuất
              </Button>
            )}
            <Button onClick={handleConfirm} disabled={isPending} variant={run.status === "draft" ? "secondary" : "default"}>
              Hoàn thành
            </Button>
            <Button onClick={handleCancel} disabled={isPending} variant="destructive">
              Hủy lệnh
            </Button>
          </div>
        </div>
      )}
      
      {run.status === "completed" && (
        <div className="border-t pt-4">
            <Label className="text-muted-foreground">SL Thực tế</Label>
            <div className="font-medium">{run.actual_quantity} {unit}</div>
        </div>
      )}
    </AppSection>
  );
}
