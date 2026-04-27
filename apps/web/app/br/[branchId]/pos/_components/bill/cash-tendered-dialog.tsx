"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "@/components/form";
import { confirmCashPayment } from "../../payment-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
interface CashTenderedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  totalAmount: number;
  onSuccess: () => void | Promise<void>;
}

/** Round total up to nearest round bill denomination for quick-fill chips. */
function roundUpToStep(total: number, step: number): number {
  return Math.ceil(total / step) * step;
}

export function CashTenderedDialog({
  open,
  onOpenChange,
  orderId,
  totalAmount,
  onSuccess,
}: CashTenderedDialogProps) {
  const [cashInput, setCashInput] = useState<string>(() =>
    totalAmount > 0 ? String(Math.round(totalAmount)) : "",
  );
  const [pending, startTransition] = useTransition();

  // Reset input whenever the dialog reopens for a new order / new total.
  useEffect(() => {
    if (open) {
      setCashInput(totalAmount > 0 ? String(Math.round(totalAmount)) : "");
    }
  }, [open, totalAmount]);

  const cashReceived = Number(cashInput) || 0;
  const cashChange = cashReceived - totalAmount;
  const isUnderpaid = cashReceived < totalAmount;
  const canSubmit = !pending && cashReceived >= totalAmount && totalAmount > 0;

  // Quick-fill chips — common denominations rounded up from total.
  const quickAmounts = useMemo(() => {
    const base = Math.max(1, Math.round(totalAmount));
    return [
      { label: "Đúng tiền", value: base },
      { label: "Lên 10k", value: roundUpToStep(base, 10_000) },
      { label: "Lên 50k", value: roundUpToStep(base, 50_000) },
      { label: "Lên 100k", value: roundUpToStep(base, 100_000) },
      { label: "Lên 500k", value: roundUpToStep(base, 500_000) },
    ].filter((c, i, arr) => arr.findIndex((x) => x.value === c.value) === i);
  }, [totalAmount]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await confirmCashPayment(orderId, cashReceived);
      if (result.success && result.data) {
        toast.success("Đã xác nhận thanh toán", {
          description: `Tiền trả khách: ${formatVND(result.data.cash_change)}`,
        });
        // Receipt enqueue is fail-soft inside confirm_cash_payment — surface
        // any printer error as a warning so the cashier can re-print once
        // the printer is back. Money is already in the drawer.
        if (result.data.print_warning) {
          toast.warning("Không in được hóa đơn", {
            description: `${result.data.print_warning} — bấm "in lại" sau khi sửa máy in.`,
          });
        }
        onOpenChange(false);
        await onSuccess();
      } else {
        toast.error(result.error ?? "Không thể xác nhận thanh toán");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thanh toán tiền mặt</DialogTitle>
          <DialogDescription>
            Nhập số tiền khách đưa — hệ thống tự tính tiền trả lại.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardContent className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                Tổng cần thu
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatVND(totalAmount)}
              </span>
            </CardContent>
          </Card>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cash-received">Tiền nhận</FieldLabel>
              <FormattedNumberInput
                id="cash-received"
                data-testid="bill-cash-received"
                maxFractionDigits={0}
                value={cashInput}
                onValueChange={setCashInput}
                onFocus={(e) => e.currentTarget.select()}
                className="text-lg tabular-nums"
                disabled={pending}
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {quickAmounts.map((c) => (
                  <Button
                    key={c.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCashInput(String(c.value))}
                    disabled={pending}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </Field>
          </FieldGroup>

          <Alert
            className={cn(
              isUnderpaid
                ? "border-destructive/50 bg-destructive/5"
                : "border-primary/50 bg-primary/5",
            )}
          >
            <AlertDescription className="flex items-center justify-between gap-3 text-current">
              <span className="text-sm font-medium">Tiền trả khách</span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  isUnderpaid ? "text-destructive" : "text-primary",
                )}
              >
                {isUnderpaid
                  ? `Thiếu ${formatVND(Math.abs(cashChange))}`
                  : formatVND(cashChange)}
              </span>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="button"
            data-testid="bill-confirm-cash"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Xác nhận thanh toán
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
