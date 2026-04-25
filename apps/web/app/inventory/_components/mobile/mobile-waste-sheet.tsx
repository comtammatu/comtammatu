"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  TriangleAlert as IconAlertTriangle,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { TouchButton } from "./touch-button";
import { NumberPadSheet } from "./number-pad-sheet";
import { createWasteEntry } from "../../waste-actions";
import { WASTE_TIER_ZERO_VND } from "../../_lib/constants";

interface MobileWasteSheetTarget {
  ingredientId: number;
  ingredientName: string;
  branchId: number;
  unit: string;
  unitCost: number;
  suggestedQuantity: number;
  lot?: {
    batchNumber: string | null;
    grnNumber: string;
    expiryDate: string;
  };
}

interface MobileWasteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: MobileWasteSheetTarget | null;
  /** Pre-resolved default issue location for the branch. */
  locationId: number | null;
  onComplete: () => void;
}

/**
 * Bottom sheet for the mobile expiry → waste flow. Wraps the canonical
 * `createWasteEntry` server action so the tier system, anti-split, and
 * period-close gates apply identically to the desktop dialog. Tier-1
 * lines (value ≥ WASTE_TIER_ZERO_VND) are blocked client-side and routed
 * to `/inventory/waste/new` for proper photo evidence — same posture as
 * the desktop dialog.
 *
 * Quantity edit happens in a nested `<NumberPadSheet>` so cashiers stay
 * in the touch-optimised number-pad pattern they already use for GRN
 * receive and production output.
 */
export function MobileWasteSheet({
  open,
  onOpenChange,
  target,
  locationId,
  onComplete,
}: MobileWasteSheetProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState<number>(0);
  const [padOpen, setPadOpen] = useState(false);
  const [isPending, startSubmit] = useTransition();

  // Reset qty whenever the target changes (sheet opens for a different lot).
  useEffect(() => {
    setQuantity(target?.suggestedQuantity ?? 0);
  }, [target]);

  const lineValue = useMemo(() => {
    if (!target) return 0;
    return quantity * (target.unitCost ?? 0);
  }, [target, quantity]);

  const overTierZero = lineValue >= WASTE_TIER_ZERO_VND;
  const canSubmit =
    !isPending &&
    !overTierZero &&
    quantity > 0 &&
    locationId != null &&
    target != null;

  function composeNote(t: MobileWasteSheetTarget): string {
    if (!t.lot) return `Hết hạn — ${t.ingredientName}`;
    const lotPart = t.lot.batchNumber
      ? ` lô ${t.lot.batchNumber}`
      : ` (không có mã lô)`;
    return `Hết hạn — ${t.ingredientName}${lotPart} HSD ${t.lot.expiryDate} (GRN ${t.lot.grnNumber})`;
  }

  function handleSubmit() {
    if (!canSubmit || !target || locationId == null) return;
    startSubmit(async () => {
      const res = await createWasteEntry({
        branchId: target.branchId,
        locationId,
        items: [
          {
            ingredient_id: target.ingredientId,
            quantity,
            unit: target.unit,
            unit_cost: target.unitCost > 0 ? target.unitCost : undefined,
            reason_code: "expired",
            note: composeNote(target),
          },
        ],
        sourceType: "manual",
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể tạo phiếu hao hụt.");
        return;
      }
      const data = res.data;
      const summary = `${data.itemsCreated} lô${data.requiresApproval ? " (chờ duyệt)" : ""}`;
      toast.success(`Đã tạo phiếu ${data.issueNumber} · ${summary}`);
      onOpenChange(false);
      onComplete();
      if (data.requiresApproval) {
        router.push("/inventory/waste/approvals");
      }
    });
  }

  function handleOpenFullForm() {
    onOpenChange(false);
    router.push("/inventory/waste/new");
  }

  return (
    <>
      <Sheet open={open && !padOpen} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-4">
          <SheetHeader>
            <SheetTitle>Hao hụt nhanh</SheetTitle>
            <SheetDescription>
              Tier 0 (&lt; {WASTE_TIER_ZERO_VND.toLocaleString("vi-VN")}đ).
              Lô vượt mức cần ảnh chứng cứ — mở phiếu chi tiết.
            </SheetDescription>
          </SheetHeader>

          {target ? (
            <div className="flex flex-col gap-4 px-4">
              <div className="flex flex-col gap-1 border bg-muted/20 px-3 py-2">
                <p className="font-semibold leading-tight">
                  {target.ingredientName}
                </p>
                {target.lot ? (
                  <p className="text-xs text-muted-foreground">
                    Lô: {target.lot.batchNumber ?? "—"} · GRN:{" "}
                    {target.lot.grnNumber} · HSD: {target.lot.expiryDate}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Nhập ban đầu: {target.suggestedQuantity} {target.unit}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPadOpen(true)}
                className={cn(
                  "flex flex-col items-stretch gap-1 border bg-card px-3 py-3 text-left",
                  overTierZero && "border-warning/40 bg-warning/5",
                )}
              >
                <span className="text-xs text-muted-foreground">
                  Số lượng hao hụt
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {quantity} {target.unit}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    overTierZero
                      ? "text-warning font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  Giá trị: {lineValue.toLocaleString("vi-VN")}đ
                </span>
              </button>

              {overTierZero ? (
                <div className="flex items-center gap-2 border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
                  <IconAlertTriangle className="size-4 shrink-0 text-warning" />
                  <span>
                    Vượt tier 0 — cần ảnh chứng cứ. Mở phiếu chi tiết để
                    upload.
                  </span>
                </div>
              ) : null}

              {locationId == null ? (
                <Badge variant="warning" className="self-start">
                  Chi nhánh chưa cấu hình kho xuất mặc định
                </Badge>
              ) : null}
            </div>
          ) : null}

          <SheetFooter className="gap-2 px-4">
            {overTierZero ? (
              <TouchButton
                type="button"
                variant="outline"
                onClick={handleOpenFullForm}
                disabled={isPending}
              >
                Mở phiếu chi tiết (kèm ảnh)
              </TouchButton>
            ) : (
              <TouchButton
                type="button"
                variant="destructive"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                <IconTrash className="size-4" />
                {isPending ? "Đang xử lý..." : "Xác nhận hao hụt"}
              </TouchButton>
            )}
            <TouchButton
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </TouchButton>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {target ? (
        <NumberPadSheet
          open={padOpen}
          onOpenChange={setPadOpen}
          title="Số lượng hao hụt"
          initialValue={quantity}
          suffix={target.unit}
          onConfirm={(value) => {
            setQuantity(value);
            setPadOpen(false);
          }}
          confirmLabel="Cập nhật"
        />
      ) : null}
    </>
  );
}

export type { MobileWasteSheetTarget };
