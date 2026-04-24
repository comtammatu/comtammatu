"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirmCashPayment } from "../../payment-actions";

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
    ].filter(
      (c, i, arr) => arr.findIndex((x) => x.value === c.value) === i,
    );
  }, [totalAmount]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await confirmCashPayment(orderId, cashReceived);
      if (result.success && result.data) {
        toast.success("Đã xác nhận thanh toán", {
          description: `Tiền trả khách: ${formatVND(result.data.cash_change)}`,
        });
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

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <span className="text-sm font-medium text-muted-foreground">
              Tổng cần thu
            </span>
            <span className="text-lg font-bold tabular-nums">
              {formatVND(totalAmount)}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash-received">Tiền nhận</Label>
            <Input
              id="cash-received"
              data-testid="bill-cash-received"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
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
          </div>

          <div
            className={`flex items-center justify-between rounded-lg border p-3 ${
              isUnderpaid
                ? "border-destructive/50 bg-destructive/5"
                : "border-primary/50 bg-primary/5"
            }`}
          >
            <span className="text-sm font-medium">Tiền trả khách</span>
            <span
              className={`text-lg font-bold tabular-nums ${
                isUnderpaid ? "text-destructive" : "text-primary"
              }`}
            >
              {isUnderpaid
                ? `Thiếu ${formatVND(Math.abs(cashChange))}`
                : formatVND(cashChange)}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            data-testid="bill-confirm-cash"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {pending ? (
              <Spinner className="mr-2" />
            ) : null}
            Xác nhận thanh toán
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
