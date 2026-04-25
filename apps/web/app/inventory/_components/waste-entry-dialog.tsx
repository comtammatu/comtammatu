"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert as IconAlertTriangle, Trash as IconTrash } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { FormattedNumberInput } from "./formatted-number-input";
import { createWasteEntry } from "../waste-actions";
import { WASTE_TIER_ZERO_VND } from "../_lib/constants";

export { WASTE_TIER_ZERO_VND };

export interface WasteEntryItem {
  /** Stable client-side id for selection / list keys. */
  clientId: string;
  ingredientId: number;
  ingredientName: string;
  branchId: number;
  branchName: string;
  unit: string;
  unitCost: number;
  /** Default qty to pre-fill (typically `received_quantity` of the lot). */
  suggestedQuantity: number;
  /** Optional lot context for audit-trail note composition. */
  lot?: {
    batchNumber: string | null;
    grnNumber: string;
    expiryDate: string;
  };
}

interface WasteEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All items we want to waste in one batch — must share branchId. */
  items: WasteEntryItem[];
  branchId: number;
  /** Pre-resolved default issue location for the branch. */
  locationId: number | null;
  /** Default reason code (UI hides dropdown — Phase 3 keeps it simple). */
  reasonCode?: "expired" | "spoiled" | "quality_fail" | "other";
  onComplete: () => void;
}

/**
 * Reusable inline waste-entry dialog. Routes through canonical
 * `createWasteEntry` RPC so tier system, anti-split, period-close, and
 * approval gates all apply.
 *
 * Phase 3 intentionally does NOT host photo upload: any line that would
 * trip tier ≥ 1 is expected to be rejected client-side BEFORE submit
 * (see `WASTE_TIER_ZERO_VND`); if the server still raises `42501` for
 * a line we did not pre-filter, we surface a deeplink to the full waste
 * form so the user can attach photo evidence properly.
 */
export function WasteEntryDialog({
  open,
  onOpenChange,
  items,
  branchId,
  locationId,
  reasonCode = "expired",
  onComplete,
}: WasteEntryDialogProps) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((item) => [item.clientId, String(item.suggestedQuantity)]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [isPending, startSubmit] = useTransition();

  // Reset qty map whenever the items set changes. We track a stable string
  // key derived from items so this fires only when membership changes, not
  // on every parent re-render.
  const itemsKey = useMemo(
    () => items.map((it) => it.clientId).join("|"),
    [items],
  );
  useEffect(() => {
    const fresh: Record<string, string> = {};
    for (const item of items) {
      fresh[item.clientId] = String(item.suggestedQuantity);
    }
    setQuantities(fresh);
    setNotes("");
  }, [itemsKey, items]);

  const isMulti = items.length > 1;

  const tierEstimates = useMemo(() => {
    return items.map((item) => {
      const qty = Number(quantities[item.clientId] ?? 0);
      const value = qty * (item.unitCost ?? 0);
      return {
        item,
        qty,
        value,
        overTierZero: value >= WASTE_TIER_ZERO_VND,
      };
    });
  }, [items, quantities]);

  const eligibleLines = tierEstimates.filter(
    (entry) => !entry.overTierZero && entry.qty > 0,
  );
  const blockedLines = tierEstimates.filter((entry) => entry.overTierZero);
  const zeroQtyLines = tierEstimates.filter(
    (entry) => entry.qty <= 0 && !entry.overTierZero,
  );

  const totalValue = eligibleLines.reduce((sum, e) => sum + e.value, 0);

  const canSubmit =
    !isPending && locationId != null && eligibleLines.length > 0;

  function handleSubmit() {
    if (!canSubmit || locationId == null) return;
    startSubmit(async () => {
      const payloadItems = eligibleLines.map(({ item, qty }) => ({
        ingredient_id: item.ingredientId,
        quantity: qty,
        unit: item.unit,
        unit_cost: item.unitCost > 0 ? item.unitCost : undefined,
        reason_code: reasonCode,
        note: composeLineNote(item),
      }));

      const headerNote = isMulti
        ? `Hao hụt hàng loạt do hết hạn — ${eligibleLines.length} lô. ${notes.trim()}`.trim()
        : notes.trim() || undefined;

      const res = await createWasteEntry({
        branchId,
        locationId,
        items: payloadItems,
        sourceType: "manual",
        notes: headerNote,
      });

      if (!res.success || !res.data) {
        const errorMessage = res.error ?? "Không thể tạo phiếu hao hụt.";
        if (errorMessage.toLowerCase().includes("tier")) {
          toast.error(
            `${errorMessage}. Hãy mở phiếu chi tiết để đính kèm ảnh chứng cứ.`,
          );
        } else {
          toast.error(errorMessage);
        }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isMulti
              ? `Hao hụt ${items.length} lô do hết hạn`
              : "Hao hụt nhanh"}
          </DialogTitle>
          <DialogDescription>
            Phiếu sẽ được ghi qua workflow Hao hụt (tier 0). Lô có giá trị
            ≥ {WASTE_TIER_ZERO_VND.toLocaleString("vi-VN")}đ cần ảnh chứng
            cứ — vui lòng dùng phiếu chi tiết.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {tierEstimates.map(({ item, value, overTierZero }) => {
            const stringQty = quantities[item.clientId] ?? "";
            return (
              <div
                key={item.clientId}
                className={cn(
                  "flex flex-col gap-2 border bg-muted/20 p-3",
                  overTierZero && "border-warning/40 bg-warning/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {item.ingredientName}
                    </p>
                    {item.lot ? (
                      <p className="text-xs text-muted-foreground">
                        Lô: {item.lot.batchNumber ?? "—"} · GRN:{" "}
                        {item.lot.grnNumber} · HSD: {item.lot.expiryDate}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Nhập ban đầu:{" "}
                      <span className="font-mono tabular-nums">
                        {item.suggestedQuantity}
                      </span>{" "}
                      {item.unit}
                    </p>
                  </div>
                  {overTierZero ? (
                    <Badge variant="warning" className="shrink-0">
                      <IconAlertTriangle className="size-3" />
                      Vượt tier 0
                    </Badge>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`qty-${item.clientId}`} className="text-xs">
                      Số lượng hao hụt
                    </Label>
                    <FormattedNumberInput
                      id={`qty-${item.clientId}`}
                      value={stringQty}
                      onValueChange={(value) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [item.clientId]: value,
                        }))
                      }
                      maxFractionDigits={3}
                      placeholder="0"
                      disabled={isPending || overTierZero}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Giá trị ước tính</Label>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        overTierZero && "text-warning",
                      )}
                    >
                      {value.toLocaleString("vi-VN")}đ
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {isMulti ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-notes">Ghi chú phiếu (tuỳ chọn)</Label>
            <Textarea
              id="bulk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ví dụ: lô tồn lâu chưa kịp xử lý"
              disabled={isPending}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
          <span className="text-muted-foreground">Sẽ tạo phiếu cho:</span>
          <span className="font-semibold tabular-nums">
            {eligibleLines.length} lô
          </span>
          {blockedLines.length > 0 ? (
            <Badge variant="warning">
              {blockedLines.length} lô vượt tier 0 — bỏ qua
            </Badge>
          ) : null}
          {zeroQtyLines.length > 0 ? (
            <Badge variant="outline">
              {zeroQtyLines.length} lô qty=0 — bỏ qua
            </Badge>
          ) : null}
          <span className="ml-auto text-muted-foreground">
            Tổng giá trị:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {totalValue.toLocaleString("vi-VN")}đ
            </span>
          </span>
        </div>

        <DialogFooter className="gap-2">
          {blockedLines.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/inventory/waste/new")}
              disabled={isPending}
            >
              Mở phiếu chi tiết (kèm ảnh)
            </Button>
          ) : null}
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
            disabled={!canSubmit}
            variant="destructive"
          >
            <IconTrash className="size-3.5" />
            {isPending
              ? "Đang xử lý..."
              : isMulti
                ? `Hao hụt ${eligibleLines.length} lô`
                : "Xác nhận hao hụt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function composeLineNote(item: WasteEntryItem): string {
  if (!item.lot) return `Hết hạn — ${item.ingredientName}`;
  const lotPart = item.lot.batchNumber
    ? ` lô ${item.lot.batchNumber}`
    : ` (không có mã lô)`;
  return `Hết hạn — ${item.ingredientName}${lotPart} HSD ${item.lot.expiryDate} (GRN ${item.lot.grnNumber})`;
}
