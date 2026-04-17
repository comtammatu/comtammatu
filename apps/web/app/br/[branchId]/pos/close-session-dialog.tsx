"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ShieldCheck,
} from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { closePosSession } from "./actions";

interface CloseSummary {
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_difference: number;
  order_count: number;
  opened_at: string;
  closed_at: string;
}

interface CloseSessionDialogProps {
  sessionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloseSessionDialog({
  sessionId,
  open,
  onOpenChange,
}: CloseSessionDialogProps) {
  const router = useRouter();
  const [closingCash, setClosingCash] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClose = useCallback(() => {
    const cash = Number(closingCash);
    if (Number.isNaN(cash) || cash < 0) {
      toast.error("Số tiền đóng ca không hợp lệ");
      return;
    }

    startTransition(async () => {
      const result = await closePosSession(sessionId, cash, note || undefined);

      if (result.success && result.data) {
        setSummary(result.data as CloseSummary);
      } else {
        toast.error(result.error ?? "Không thể đóng ca");
      }
    });
  }, [sessionId, closingCash, note]);

  const handleConfirm = useCallback(() => {
    toast.success("Đóng ca thành công");
    onOpenChange(false);
    setSummary(null);
    setClosingCash("");
    setNote("");
    router.refresh();
  }, [onOpenChange, router]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && summary) {
        // If summary is showing, confirm closes instead
        handleConfirm();
        return;
      }
      if (!nextOpen) {
        setSummary(null);
        setClosingCash("");
        setNote("");
      }
      onOpenChange(nextOpen);
    },
    [summary, handleConfirm, onOpenChange],
  );

  const diffColor = (diff: number) => {
    if (diff === 0) return "text-success";
    if (Math.abs(diff) <= 50000) return "text-warning";
    return "text-destructive";
  };
  const closeProgressPercent = summary
    ? 100
    : isPending
      ? 72
      : closingCash !== ""
        ? 46
        : 18;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {summary ? "Tổng kết ca" : "Đóng ca bán hàng"}
          </DialogTitle>
          <DialogDescription>
            {summary
              ? "Kiểm tra thông tin ca trước khi xác nhận"
              : "Nhập tiền mặt cuối ca để đóng ca"}
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border bg-card shadow-sm p-4">
              <div className="relative space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tổng kết ca</p>
                    <p className="mt-1 text-base font-semibold">
                      Ca đã được đối soát, chỉ còn bước xác nhận cuối.
                    </p>
                  </div>
                  <div className="rounded-full border border-success/15 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success shadow-sm">
                    100%
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card shadow-sm p-4">
              <div className="relative flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiền đầu ca</span>
                  <span className="font-medium">
                    {formatVND(summary.opening_cash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Doanh thu dự kiến
                  </span>
                  <span className="font-medium">
                    {formatVND(summary.expected_cash)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiền cuối ca</span>
                  <span className="font-medium">
                    {formatVND(summary.closing_cash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chênh lệch</span>
                  <span
                    className={cn(
                      "font-bold",
                      diffColor(summary.cash_difference),
                    )}
                  >
                    {summary.cash_difference >= 0 ? "+" : ""}
                    {formatVND(summary.cash_difference)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Số đơn hàng</span>
                  <span className="font-medium">{summary.order_count}</span>
                </div>
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium",
                    summary.cash_difference === 0
                      ? "border-success/20 bg-success/10 text-success"
                      : Math.abs(summary.cash_difference) <= 50000
                        ? "border-warning/20 bg-warning/10 text-warning"
                        : "border-destructive/20 bg-destructive/10 text-destructive",
                  )}
                >
                  {summary.cash_difference === 0
                    ? "Số dư khớp hoàn toàn, có thể chốt ca."
                    : Math.abs(summary.cash_difference) <= 50000
                      ? "Có chênh lệch nhỏ, nên xác nhận lại trước khi chốt."
                      : "Chênh lệch lớn, cần kiểm tra kỹ tiền mặt trước khi xác nhận."}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                className="w-full rounded-lg shadow-sm transition-transform hover:translate-y-[-1px]"
                size="lg"
                onClick={handleConfirm}
              >
                <CheckCircle2 className="mr-2 size-4" />
                Xác nhận
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-card shadow-sm p-4">
              <div className="relative space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Đóng ca</p>
                    <p className="mt-1 text-base font-semibold">
                      Nhập tiền mặt cuối ca để hệ thống đối chiếu và chốt phiên.
                    </p>
                  </div>
                  <div className="rounded-full border border-primary/15 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                    {String(Math.round(closeProgressPercent))}%
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    data-indeterminate={isPending ? "true" : undefined}
                    style={isPending ? undefined : { width: `${closeProgressPercent}%` }}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div
                    className="rounded-lg border bg-card shadow-sm p-3"
                    data-state={closingCash !== "" ? "done" : "current"}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                        <CircleDollarSign className="size-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Nhập tiền</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Ghi nhận số dư quầy cuối ca
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    className="rounded-lg border bg-card shadow-sm p-3"
                    data-state={isPending ? "current" : closingCash !== "" ? "done" : "todo"}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                        <ShieldCheck className="size-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Đối chiếu</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Hệ thống tính số dự kiến và chênh lệch
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    className="rounded-lg border bg-card shadow-sm p-3"
                    data-state={summary ? "done" : "todo"}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                        <AlertTriangle className="size-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Xác nhận</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Chốt phiên sau khi kiểm tra đủ
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="closing-cash">Tiền mặt cuối ca (VNĐ)</Label>
              <Input
                id="closing-cash"
                type="number"
                min="0"
                step="1000"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="close-note">Ghi chú (tùy chọn)</Label>
              <Input
                id="close-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú ca..."
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-lg"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button
                className="rounded-lg"
                onClick={handleClose}
                disabled={isPending || closingCash === ""}
              >
                {isPending ? (
                  <>
                    <Spinner className="mr-2" />
                    Đang đóng...
                  </>
                ) : (
                  "Đóng ca"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
