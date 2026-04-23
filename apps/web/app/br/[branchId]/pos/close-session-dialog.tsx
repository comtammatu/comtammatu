"use client";

import { useCallback, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Progress } from "@comtammatu/ui/components/progress";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCurrencyDollar,
  IconShieldCheck,
} from "@tabler/icons-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { NumberField, TextField } from "@/components/form";
import { closePosSession } from "./actions";

const closeSessionSchema = z.object({
  closing_cash: z
    .string()
    .trim()
    .min(1, { error: "Tiền mặt cuối ca không được trống" })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0;
      },
      { error: "Số tiền đóng ca không hợp lệ" },
    ),
  note: z.string().optional(),
});

type CloseSessionFormValues = z.infer<typeof closeSessionSchema>;

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
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<CloseSessionFormValues>({
    resolver: zodResolver(closeSessionSchema),
    defaultValues: { closing_cash: "", note: "" },
  });

  const closingCashValue = form.watch("closing_cash");

  const handleClose = useCallback(
    (values: CloseSessionFormValues) => {
      const cash = Number(values.closing_cash);
      startTransition(async () => {
        const result = await closePosSession(
          sessionId,
          cash,
          values.note || undefined,
        );
        if (result.success && result.data) {
          setSummary(result.data as CloseSummary);
        } else {
          toast.error(result.error ?? "Không thể đóng ca");
        }
      });
    },
    [sessionId],
  );

  const handleConfirm = useCallback(() => {
    toast.success("Đóng ca thành công");
    onOpenChange(false);
    setSummary(null);
    form.reset();
    router.refresh();
  }, [onOpenChange, router, form]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && summary) {
        handleConfirm();
        return;
      }
      if (!nextOpen) {
        setSummary(null);
        form.reset();
      }
      onOpenChange(nextOpen);
    },
    [summary, handleConfirm, onOpenChange, form],
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
      : closingCashValue !== ""
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
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Tổng kết ca
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      Ca đã được đối soát, chỉ còn bước xác nhận cuối.
                    </p>
                  </div>
                  <Badge variant="success">
                    100%
                  </Badge>
                </div>
                <Progress value={100} className="h-2" />
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
                className="w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                size="lg"
                onClick={handleConfirm}
              >
                <IconCircleCheck className="mr-2 size-4" />
                Xác nhận
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={form.handleSubmit(handleClose)}
            noValidate
            className="flex flex-col gap-4"
          >
            <div className="rounded-lg border bg-card shadow-sm p-4">
              <div className="relative space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Đóng ca
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      Nhập tiền mặt cuối ca để hệ thống đối chiếu và chốt phiên.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {String(Math.round(closeProgressPercent))}%
                  </Badge>
                </div>
                <Progress value={closeProgressPercent} className="h-2" />
                <div className="grid gap-2 sm:grid-cols-3">
                  <div
                    className="rounded-lg border bg-card shadow-sm p-3"
                    data-state={closingCashValue !== "" ? "done" : "current"}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                        <IconCurrencyDollar className="size-3.5" />
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
                    data-state={
                      isPending
                        ? "current"
                        : closingCashValue !== ""
                          ? "done"
                          : "todo"
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                        <IconShieldCheck className="size-3.5" />
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
                        <IconAlertTriangle className="size-3.5" />
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

            <FieldGroup>
              <NumberField
                control={form.control}
                name="closing_cash"
                label="Tiền mặt cuối ca (VNĐ)"
                maxFractionDigits={0}
                placeholder="0"
                autoFocus
                required
              />
              <TextField
                control={form.control}
                name="note"
                label="Ghi chú (tùy chọn)"
                placeholder="Ghi chú ca..."
              />
            </FieldGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                className="rounded-lg"
                disabled={isPending || closingCashValue === ""}
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
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
