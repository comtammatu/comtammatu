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

interface MobileBulkWasteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All targets must share `branchId` — caller (expiry select-mode) enforces. */
  targets: MobileWasteSheetTarget[];
  branchId: number;
  locationId: number | null;
  onComplete: () => void;
}

/**
 * Bulk variant of `<MobileWasteSheet>`. Renders a read-only list of lots,
 * sums the line value for the user, and submits everything in one
 * `createWasteEntry` call. Tier-0 filtering happens upstream at the
 * select-mode layer (`mobile-expiry-client`) so this sheet only sees
 * lines that already cleared the threshold — keeps the UX promise that
 * "Hao hụt N lô" actually means N.
 *
 * No NumberPad. v1 auto-confirms qty = `received_quantity` per lot. If
 * the cashier needs to override a single lot, they exit select-mode and
 * use the per-row flow which already wraps `<NumberPadSheet>`.
 */
export function MobileBulkWasteSheet({
  open,
  onOpenChange,
  targets,
  branchId,
  locationId,
  onComplete,
}: MobileBulkWasteSheetProps) {
  const router = useRouter();
  const [isPending, startSubmit] = useTransition();

  const totalValue = useMemo(
    () =>
      targets.reduce(
        (sum, t) => sum + (t.suggestedQuantity * (t.unitCost ?? 0)),
        0,
      ),
    [targets],
  );

  const canSubmit =
    !isPending && targets.length > 0 && locationId != null;

  function composeBulkLineNote(t: MobileWasteSheetTarget): string {
    if (!t.lot) return `Hết hạn — ${t.ingredientName}`;
    const lotPart = t.lot.batchNumber
      ? ` lô ${t.lot.batchNumber}`
      : ` (không có mã lô)`;
    return `Hết hạn — ${t.ingredientName}${lotPart} HSD ${t.lot.expiryDate} (GRN ${t.lot.grnNumber})`;
  }

  function handleSubmit() {
    if (!canSubmit || locationId == null) return;
    startSubmit(async () => {
      const res = await createWasteEntry({
        branchId,
        locationId,
        items: targets.map((t) => ({
          ingredient_id: t.ingredientId,
          quantity: t.suggestedQuantity,
          unit: t.unit,
          unit_cost: t.unitCost > 0 ? t.unitCost : undefined,
          reason_code: "expired",
          note: composeBulkLineNote(t),
        })),
        sourceType: "manual",
        notes: `Hao hụt hàng loạt — ${targets.length} lô hết hạn`,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-4">
        <SheetHeader>
          <SheetTitle>Hao hụt {targets.length} lô</SheetTitle>
          <SheetDescription>
            Số lượng tự động lấy theo "Nhập ban đầu" của lô. Nếu cần đổi
            cho từng lô, hãy thoát chế độ chọn nhiều và xử lý từng dòng.
          </SheetDescription>
        </SheetHeader>

        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto px-4">
          {targets.map((t, idx) => {
            const lineValue = t.suggestedQuantity * (t.unitCost ?? 0);
            return (
              <div
                key={`${t.ingredientId}-${idx}`}
                className="flex flex-col gap-1 border bg-muted/20 px-3 py-2"
              >
                <p className="truncate font-semibold leading-tight">
                  {t.ingredientName}
                </p>
                {t.lot ? (
                  <p className="truncate text-xs text-muted-foreground">
                    Lô: {t.lot.batchNumber ?? "—"} · GRN: {t.lot.grnNumber}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">
                    {t.suggestedQuantity}
                  </span>{" "}
                  {t.unit} ·{" "}
                  <span className="tabular-nums">
                    {lineValue.toLocaleString("vi-VN")}đ
                  </span>
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t px-4 pt-3 text-sm">
          <span className="text-muted-foreground">Tổng giá trị</span>
          <span className="font-semibold tabular-nums">
            {totalValue.toLocaleString("vi-VN")}đ
          </span>
        </div>

        {locationId == null ? (
          <div className="px-4">
            <Badge variant="warning">
              Chi nhánh chưa cấu hình kho xuất mặc định
            </Badge>
          </div>
        ) : null}

        <SheetFooter className="gap-2 px-4">
          <TouchButton
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            <IconTrash className="size-4" />
            {isPending
              ? "Đang xử lý..."
              : `Xác nhận hao hụt ${targets.length} lô`}
          </TouchButton>
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
  );
}

export type { MobileWasteSheetTarget };
