"use client";

import { useEffect, useMemo, useState } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
import { Textarea } from "@comtammatu/ui/components/textarea";
import { FormattedNumberInput } from "@/components/form";

interface ServiceChargeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  currentAmount: number;
  isPending?: boolean;
  onSubmit: (input: { amount: number; note: string }) => void;
  onClear: (reason: string) => void;
}

export function ServiceChargeSheet({
  open,
  onOpenChange,
  subtotal,
  taxAmount,
  discountAmount,
  currentAmount,
  isPending = false,
  onSubmit,
  onClear,
}: ServiceChargeSheetProps) {
  const [amountText, setAmountText] = useState<string>(
    currentAmount > 0 ? String(Math.round(currentAmount)) : "",
  );
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmountText(currentAmount > 0 ? String(Math.round(currentAmount)) : "");
    setNote("");
  }, [open, currentAmount]);

  const hasExistingCharge = currentAmount > 0;

  const numericAmount = useMemo(() => {
    const normalized = amountText.trim().replace(",", ".");
    if (normalized === "") return 0;
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.min(Math.round(value), 50000000);
  }, [amountText]);

  const previewTotal = Math.max(
    0,
    subtotal + taxAmount + numericAmount - discountAmount,
  );

  const noteTrimLen = note.trim().length;
  const noteValid = noteTrimLen >= 3;
  const canApply = numericAmount > 0 && noteValid && !isPending;
  const canClear = hasExistingCharge && noteValid && !isPending;

  const handleClose = () => {
    if (isPending) return;
    onOpenChange(false);
  };

  const handleApply = () => {
    if (!canApply) return;
    onSubmit({ amount: numericAmount, note: note.trim() });
  };

  const handleClear = () => {
    if (!canClear) return;
    onClear(note.trim());
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <SheetContent
        side="right"
        className="flex flex-col data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-3 py-2.5 text-left sm:px-4">
          <SheetTitle>Phụ phí</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="service-charge-amount">
                Số tiền phụ phí
              </FieldLabel>
              <FormattedNumberInput
                id="service-charge-amount"
                maxFractionDigits={0}
                value={amountText}
                onValueChange={setAmountText}
                placeholder="Vd: 10000"
              />
              <FieldDescription>
                Dùng cho phí ship, đóng gói hoặc phụ phí khác trước khi thanh
                toán.
              </FieldDescription>
            </Field>

            <Field data-invalid={!noteValid && noteTrimLen > 0}>
              <FieldLabel htmlFor="service-charge-note">Ghi chú</FieldLabel>
              <Textarea
                id="service-charge-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Vd: phí ship nội bộ, hộp mang về..."
                aria-invalid={!noteValid && noteTrimLen > 0}
                rows={2}
              />
              <FieldDescription>
                Tối thiểu 3 ký tự. ({noteTrimLen}/3)
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{FORM_VI.subtotal}</span>
              <span className="tabular-nums">{formatVND(subtotal)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Thuế</span>
                <span className="tabular-nums">{formatVND(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Phụ phí</span>
              <span className="tabular-nums">{formatVND(numericAmount)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-success">
                <span>Chiết khấu</span>
                <span className="tabular-nums">
                  -{formatVND(discountAmount)}
                </span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border/60 pt-1 font-semibold">
              <span>Tổng mới</span>
              <span className="tabular-nums">{formatVND(previewTotal)}</span>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 border-t border-border/60 px-3 py-3 sm:flex-row sm:justify-between sm:px-4">
          {hasExistingCharge ? (
            <Button
              type="button"
              variant="destructive"
              disabled={!canClear}
              onClick={handleClear}
              title={
                !noteValid
                  ? "Nhập lý do bỏ phụ phí (tối thiểu 3 ký tự)."
                  : undefined
              }
              className="sm:order-first"
            >
              Bỏ phụ phí
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
              Áp dụng
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
