"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Progress } from "@comtammatu/ui/components/progress";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCircleCheck,
} from "@tabler/icons-react";
import { closePosSession } from "./actions";
import {
  DenominationInput,
  sumDenominations,
  type DenominationCounts,
} from "./_components/close-session/denomination-input";

interface CloseSummary {
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_difference: number;
  order_count: number;
  opened_at: string;
  closed_at: string;
}

type Step = "count" | "reconcile";

const SIGNIFICANT_DIFF_THRESHOLD = 50_000;

function diffToneClass(diff: number): string {
  if (diff === 0) return "text-success";
  if (Math.abs(diff) <= SIGNIFICANT_DIFF_THRESHOLD) return "text-warning";
  return "text-destructive";
}

interface CloseSessionSheetProps {
  sessionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloseSessionSheet({
  sessionId,
  open,
  onOpenChange,
}: CloseSessionSheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("count");
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalCounted = sumDenominations(counts);

  const reset = useCallback(() => {
    setStep("count");
    setCounts({});
    setNote("");
    setSummary(null);
  }, []);

  const handleSubmit = useCallback(() => {
    startTransition(async () => {
      const result = await closePosSession(
        sessionId,
        totalCounted,
        note.trim() || undefined,
      );
      if (result.success && result.data) {
        setSummary(result.data as CloseSummary);
        setStep("reconcile");
      } else {
        toast.error(result.error ?? "Không thể đóng ca");
      }
    });
  }, [note, sessionId, totalCounted]);

  const handleConfirm = useCallback(() => {
    toast.success("Đóng ca thành công");
    onOpenChange(false);
    reset();
    router.refresh();
  }, [onOpenChange, reset, router]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        if (summary) {
          handleConfirm();
          return;
        }
        reset();
      }
      onOpenChange(next);
    },
    [handleConfirm, onOpenChange, reset, summary],
  );

  const significantDiff =
    summary !== null &&
    Math.abs(summary.cash_difference) > SIGNIFICANT_DIFF_THRESHOLD;
  const needsNoteForSubmit =
    totalCounted === 0 ||
    (/* first submit on count step can't know diff yet — rely on server-side summary */ false);

  const stepIndex = step === "count" ? 1 : 2;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg p-0">
        <SheetHeader className="border-b px-5 pt-5 pb-3 text-left">
          <SheetTitle>Đóng ca bán hàng</SheetTitle>
          <SheetDescription>
            Bước {stepIndex}/2 —{" "}
            {step === "count" ? "Đếm tiền mặt cuối ca" : "Đối soát & xác nhận"}
          </SheetDescription>
          <div className="mt-2">
            <Progress value={step === "count" ? 50 : 100} className="h-2" />
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4">
            {step === "count" && (
              <div className="flex flex-col gap-4">
                <DenominationInput
                  counts={counts}
                  onCountsChange={setCounts}
                  disabled={isPending}
                />
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="close-note"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Ghi chú ca (tuỳ chọn)
                  </label>
                  <Textarea
                    id="close-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: thu hộ khách lẻ 10k, đổi tờ rách..."
                    rows={3}
                    className="resize-none rounded-lg text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nếu chênh lệch &gt; {formatVND(SIGNIFICANT_DIFF_THRESHOLD)},
                    nên bổ sung lý do ở bước đối soát.
                  </p>
                </div>
              </div>
            )}

            {step === "reconcile" && summary && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Kỳ vọng tồn quỹ
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatVND(summary.expected_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Đã đếm được
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatVND(summary.closing_cash)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chênh lệch</span>
                      <span
                        className={cn(
                          "text-base font-bold tabular-nums",
                          diffToneClass(summary.cash_difference),
                        )}
                      >
                        {summary.cash_difference >= 0 ? "+" : ""}
                        {formatVND(summary.cash_difference)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Số đơn trong ca
                      </span>
                      <span className="font-medium tabular-nums">
                        {summary.order_count}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium",
                    summary.cash_difference === 0
                      ? "border-success/20 bg-success/10 text-success"
                      : !significantDiff
                        ? "border-warning/20 bg-warning/10 text-warning"
                        : "border-destructive/20 bg-destructive/10 text-destructive",
                  )}
                >
                  {summary.cash_difference === 0
                    ? "Số dư khớp hoàn toàn. Có thể chốt ca."
                    : !significantDiff
                      ? "Chênh lệch nhỏ, xác nhận lại trước khi chốt."
                      : `Chênh lệch lớn (> ${formatVND(SIGNIFICANT_DIFF_THRESHOLD)}). Đã ghi chú chưa?`}
                </div>

                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Ca đã được ghi lại trong hệ thống. Nhấn xác nhận để đóng sheet
                  và quay về trang nhân viên.
                </div>

                <div className="flex flex-col gap-2">
                  <Badge variant="outline" className="w-fit text-xs">
                    Tiền đầu ca: {formatVND(summary.opening_cash)}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t px-5 py-4">
          {step === "count" ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-lg"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <div className="flex-1 text-right text-sm text-muted-foreground">
                Đã đếm:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatVND(totalCounted)}
                </span>
              </div>
              <Button
                type="button"
                className="min-h-11 rounded-lg"
                disabled={isPending || needsNoteForSubmit}
                onClick={handleSubmit}
              >
                {isPending ? (
                  <>
                    <Spinner className="mr-2" /> Đang gửi
                  </>
                ) : (
                  <>
                    Đối soát <IconArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => setStep("count")}
                disabled={isPending}
              >
                <IconArrowLeft className="mr-2 size-4" />
                Đếm lại
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1 rounded-lg"
                onClick={handleConfirm}
              >
                <IconCircleCheck className="mr-2 size-4" />
                Xác nhận & đóng ca
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
