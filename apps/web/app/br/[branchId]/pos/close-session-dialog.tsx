"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
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
import { Loader2 } from "lucide-react";
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
  formatVnd: (amount: number) => string;
}

export function CloseSessionDialog({
  sessionId,
  open,
  onOpenChange,
  formatVnd,
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
    if (diff === 0) return "text-green-600";
    if (Math.abs(diff) <= 50000) return "text-yellow-600";
    return "text-red-600";
  };

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
            <div className="rounded-lg border p-3">
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiền đầu ca</span>
                  <span className="font-medium">
                    {formatVnd(summary.opening_cash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Doanh thu dự kiến
                  </span>
                  <span className="font-medium">
                    {formatVnd(summary.expected_cash)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiền cuối ca</span>
                  <span className="font-medium">
                    {formatVnd(summary.closing_cash)}
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
                    {formatVnd(summary.cash_difference)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Số đơn hàng</span>
                  <span className="font-medium">{summary.order_count}</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button className="w-full" size="lg" onClick={handleConfirm}>
                Xác nhận
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
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
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button
                onClick={handleClose}
                disabled={isPending || closingCash === ""}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
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
