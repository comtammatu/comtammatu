"use client";

import { useEffect, useMemo, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { FormattedNumberInput } from "@/components/form";

import { ACTIONS_VI, FORM_VI, POS_VI } from "@comtammatu/shared/messages";
export type DiscountType = "pct" | "vnd";

interface DiscountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtotalLabel?: string;
  totalLabel?: string;
  clearLabel?: string;
  /** Subtotal trước giảm — dùng để live preview + clamp UI. */
  subtotal: number;
  /** Phụ phí trên đơn — cộng vào total preview. */
  serviceCharge: number;
  /** Discount hiện tại trên đơn (để pre-fill khi mở edit). */
  current: {
    type: DiscountType | null;
    value: number | null;
    note: string | null;
    amount: number;
  };
  isPending?: boolean;
  onSubmit: (input: {
    type: DiscountType;
    value: number;
    note: string;
  }) => void;
  /** Bỏ chiết khấu (gọi clear_order_discount). Chỉ active khi đang có discount.
   * Reason ≥3 ký tự — cùng ô textarea với "Áp dụng" để giữ UX gọn. */
  onClear: (reason: string) => void;
}

/**
 * Apply / edit / clear an order-level discount. Two tabs (% vs VND); the
 * input clamps live to the max for that tab (UI auto-correct per Q1 owner
 * decision: cashier nhập 150 → ô % tự về 100). Server clamps again as
 * defense-in-depth.
 *
 * Sheet (not Dialog) so the cashier on a mobile terminal sees the full
 * keyboard above the content. Dialog patterns work too but Sheet keeps the
 * footer pinned which matters when previewing the new total.
 */
export function DiscountSheet({
  open,
  onOpenChange,
  title = "Chiết khấu",
  subtotalLabel = FORM_VI.subtotal,
  totalLabel = POS_VI.newTotal,
  clearLabel = POS_VI.clearDiscount,
  subtotal,
  serviceCharge,
  current,
  isPending = false,
  onSubmit,
  onClear,
}: DiscountSheetProps) {
  const [type, setType] = useState<DiscountType>(current.type ?? "pct");
  const [valueText, setValueText] = useState<string>(
    current.value != null ? String(current.value) : "",
  );
  const [note, setNote] = useState<string>(current.note ?? "");

  // Re-seed local state whenever the sheet (re)opens with a different
  // current discount. Skipping this caused the form to show the previous
  // open's values when re-opened on a different order.
  useEffect(() => {
    if (!open) return;
    setType(current.type ?? "pct");
    setValueText(current.value != null ? String(current.value) : "");
    setNote(current.note ?? "");
  }, [open, current.type, current.value, current.note]);

  const hasExistingDiscount = current.amount > 0;

  // Parse + clamp the typed value so the preview always reflects what the
  // server will accept. Empty / NaN / negative => 0.
  const numericValue = useMemo(() => {
    const trimmed = valueText.trim().replace(",", ".");
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (type === "pct") return Math.min(n, 100);
    return Math.min(n, Math.max(subtotal, 0));
  }, [valueText, type, subtotal]);

  // Mirror server's compute_discount_amount so the cashier preview matches
  // the row that lands in the DB. FLOOR for pct → integer VND.
  const previewDiscountAmount = useMemo(() => {
    if (numericValue <= 0 || subtotal <= 0) return 0;
    if (type === "pct") {
      return Math.floor((subtotal * numericValue) / 100);
    }
    return Math.min(numericValue, subtotal);
  }, [numericValue, subtotal, type]);

  const previewTotal = Math.max(
    0,
    subtotal + serviceCharge - previewDiscountAmount,
  );

  const noteTrimLen = note.trim().length;
  const noteValid = noteTrimLen >= 3;
  const valueValid = previewDiscountAmount > 0;
  const canApply = noteValid && valueValid && !isPending;
  const canClear = hasExistingDiscount && noteValid && !isPending;

  const handleClose = () => {
    if (isPending) return;
    onOpenChange(false);
  };

  const handleApply = () => {
    if (!canApply) return;
    onSubmit({ type, value: numericValue, note: note.trim() });
  };

  const handleClear = () => {
    if (!canClear) return;
    onClear(note.trim());
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-4">
          <Tabs
            value={type}
            onValueChange={(v) => {
              setType(v as DiscountType);
              // Reset the value on tab switch — 10% and 10đ mean different
              // things; keeping the old number invites mistakes.
              setValueText("");
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="pct" className="flex-1">
                {POS_VI.discountPctTab}
              </TabsTrigger>
              <TabsTrigger value="vnd" className="flex-1">
                {POS_VI.discountVndTab}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="discount-value">
                {type === "pct" ? POS_VI.discountPctLabel : POS_VI.discountVndLabel}
              </FieldLabel>
              <FormattedNumberInput
                id="discount-value"
                maxFractionDigits={type === "pct" ? 2 : 0}
                value={valueText}
                onValueChange={setValueText}
                placeholder={type === "pct" ? POS_VI.discountPctPlaceholder : POS_VI.discountVndPlaceholder}
              />
              <FieldDescription>
                {type === "pct"
                  ? POS_VI.discountPctMaxHint
                  : `Tối đa ${formatVND(subtotal)} (tự giới hạn nếu nhập quá).`}
              </FieldDescription>
            </Field>

            <Field data-invalid={!noteValid && noteTrimLen > 0}>
              <FieldLabel htmlFor="discount-note">{POS_VI.discountReasonLabel}</FieldLabel>
              <Textarea
                id="discount-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={POS_VI.discountReasonPlaceholder}
                aria-invalid={!noteValid && noteTrimLen > 0}
                rows={2}
              />
              <FieldDescription>
                Tối thiểu 3 ký tự. ({noteTrimLen}/3) — dùng cho cả "Áp dụng" và
                "Bỏ chiết khấu" (lưu vào nhật ký kiểm toán).
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{subtotalLabel}</span>
              <span className="tabular-nums">{formatVND(subtotal)}</span>
            </div>
            {serviceCharge > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{POS_VI.serviceChargeTitle}</span>
                <span className="tabular-nums">{formatVND(serviceCharge)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>
                Giảm
                {type === "pct" && numericValue > 0
                  ? ` (${numericValue}%)`
                  : ""}
              </span>
              <span className="tabular-nums">
                {previewDiscountAmount > 0
                  ? `-${formatVND(previewDiscountAmount)}`
                  : "—"}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border/60 pt-1 font-semibold">
              <span>{totalLabel}</span>
              <span className="tabular-nums">{formatVND(previewTotal)}</span>
            </div>
          </div>
        </div>

        <SheetFooter className="sm:flex-row sm:justify-between">
          {hasExistingDiscount ? (
            <Button
              type="button"
              variant="destructive"
              disabled={!canClear}
              onClick={handleClear}
              title={!noteValid ? POS_VI.clearDiscountReasonTitle : undefined}
              className="sm:order-first"
            >
              {clearLabel}
            </Button>
          ) : (
            <span className="hidden sm:block" aria-hidden />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleClose}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="button" disabled={!canApply} onClick={handleApply}>
              {POS_VI.apply}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
