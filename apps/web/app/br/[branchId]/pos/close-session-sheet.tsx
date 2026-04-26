"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
  CircleCheck as IconCircleCheck,
} from "lucide-react";
import { closePosSession } from "./actions";
import type { CloseSessionErrorPayload } from "./session-actions";
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
  /** `pos:close_shift_variance_override` — gate cho phép submit khi
   * |chênh lệch| > max(50.000đ, 0.5% × expected_cash). Cashier không có quyền
   * → variance gate hiển thị banner "liên hệ quản lý" và disable submit. */
  canOverrideVariance: boolean;
}

interface VarianceGateContext {
  diff: number;
  threshold: number;
}

const VARIANCE_NOTE_MIN = 10;

export function CloseSessionSheet({
  sessionId,
  open,
  onOpenChange,
  canOverrideVariance,
}: CloseSessionSheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("count");
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [isPending, startTransition] = useTransition();
  /** Set khi RPC raise `variance_note_required`; UI flip into approval gate. */
  const [varianceCtx, setVarianceCtx] = useState<VarianceGateContext | null>(
    null,
  );
  const [varianceNote, setVarianceNote] = useState("");

  const totalCounted = sumDenominations(counts);

  // Recount sau khi đã preview variance → context cũ stale → clear để cashier
  // resubmit cho variance preview mới (server source of truth).
  useEffect(() => {
    setVarianceCtx(null);
    setVarianceNote("");
  }, [totalCounted]);

  const reset = useCallback(() => {
    setStep("count");
    setCounts({});
    setNote("");
    setSummary(null);
    setVarianceCtx(null);
    setVarianceNote("");
  }, []);

  const handleSubmit = useCallback(() => {
    startTransition(async () => {
      const trimmedVarianceNote = varianceNote.trim();
      const result = await closePosSession(
        sessionId,
        totalCounted,
        note.trim() || undefined,
        varianceCtx ? trimmedVarianceNote || undefined : undefined,
      );
      if (result.success && result.data) {
        setSummary(result.data as CloseSummary);
        setStep("reconcile");
        setVarianceCtx(null);
        return;
      }

      const meta = result.meta as CloseSessionErrorPayload | undefined;

      if (
        meta?.code === "variance_note_required" &&
        typeof meta.diff === "number" &&
        typeof meta.threshold === "number"
      ) {
        setVarianceCtx({ diff: meta.diff, threshold: meta.threshold });
        return;
      }

      if (meta?.code === "variance_requires_bm_approval") {
        toast.error(
          result.error ??
            "Chênh lệch vượt ngưỡng — cần quản lý chi nhánh đăng nhập để duyệt.",
        );
        return;
      }

      toast.error(result.error ?? "Không thể đóng ca");
    });
  }, [note, sessionId, totalCounted, varianceCtx, varianceNote]);

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
  const trimmedVarianceNote = varianceNote.trim();
  const varianceNoteValid = trimmedVarianceNote.length >= VARIANCE_NOTE_MIN;
  const submitBlockedByVariance =
    varianceCtx !== null && (!canOverrideVariance || !varianceNoteValid);
  const needsNoteForSubmit = totalCounted === 0 || submitBlockedByVariance;

  const stepIndex = step === "count" ? 1 : 2;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-lg p-0"
      >
        <SheetHeader className="border-b px-5 pt-5 pb-3 text-left">
          <SheetTitle>Đóng ca bán hàng</SheetTitle>
          <SheetDescription>
            Bước {stepIndex}/2 —{""}
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
                {varianceCtx && (
                  <Alert
                    className={cn(
                      "border-warning/30 bg-warning/10 text-warning",
                      !canOverrideVariance &&
                        "border-destructive/30 bg-destructive/10 text-destructive",
                    )}
                  >
                    <AlertDescription className="flex flex-col gap-1 text-current">
                      <span className="font-semibold">
                        Chênh lệch{" "}
                        <span className="tabular-nums">
                          {varianceCtx.diff >= 0 ? "+" : ""}
                          {formatVND(varianceCtx.diff)}
                        </span>{" "}
                        vượt ngưỡng{" "}
                        <span className="tabular-nums">
                          {formatVND(varianceCtx.threshold)}
                        </span>
                        .
                      </span>
                      <span>
                        {canOverrideVariance
                          ? `Nhập lý do duyệt ≥ ${VARIANCE_NOTE_MIN} ký tự để chốt ca.`
                          : "Liên hệ quản lý chi nhánh đăng nhập để duyệt."}
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
                {varianceCtx && (
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="close-variance-note"
                      className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Lý do duyệt chênh lệch
                    </label>
                    <Textarea
                      id="close-variance-note"
                      value={varianceNote}
                      onChange={(e) => setVarianceNote(e.target.value)}
                      placeholder="Ví dụ: két lệch 80k do trả tiền dư khách bàn 5..."
                      rows={3}
                      className="resize-none text-base"
                      disabled={isPending || !canOverrideVariance}
                    />
                    <p
                      className={cn(
                        "text-sm",
                        varianceNoteValid
                          ? "text-success"
                          : "text-muted-foreground",
                      )}
                    >
                      {trimmedVarianceNote.length}/{VARIANCE_NOTE_MIN} ký tự
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="close-note"
                    className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Ghi chú ca (tuỳ chọn)
                  </label>
                  <Textarea
                    id="close-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: thu hộ khách lẻ 10k, đổi tờ rách..."
                    rows={3}
                    className="resize-none text-base"
                  />
                  <p className="text-sm text-muted-foreground">
                    Nếu chênh lệch &gt; {formatVND(SIGNIFICANT_DIFF_THRESHOLD)},
                    nên bổ sung lý do ở bước đối soát.
                  </p>
                </div>
              </div>
            )}

            {step === "reconcile" && summary && (
              <div className="flex flex-col gap-4">
                <Card size="sm">
                  <CardContent>
                    <div className="flex flex-col gap-3 text-base">
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
                        <span className="text-muted-foreground">
                          Chênh lệch
                        </span>
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
                  </CardContent>
                </Card>

                <Alert
                  className={cn(
                    summary.cash_difference === 0
                      ? "border-success/20 bg-success/10 text-success"
                      : !significantDiff
                        ? "border-warning/20 bg-warning/10 text-warning"
                        : "border-destructive/20 bg-destructive/10 text-destructive",
                  )}
                >
                  <AlertDescription className="text-current">
                    {summary.cash_difference === 0
                      ? "Số dư khớp hoàn toàn. Có thể chốt ca."
                      : !significantDiff
                        ? "Chênh lệch nhỏ, xác nhận lại trước khi chốt."
                        : `Chênh lệch lớn (> ${formatVND(SIGNIFICANT_DIFF_THRESHOLD)}). Đã ghi chú chưa?`}
                  </AlertDescription>
                </Alert>

                <Alert>
                  <AlertDescription>
                    Ca đã được ghi lại trong hệ thống. Nhấn xác nhận để đóng
                    sheet và quay về trang nhân viên.
                  </AlertDescription>
                </Alert>

                <div className="flex flex-col gap-2">
                  <Badge variant="outline" className="w-fit text-sm">
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
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <div className="flex-1 text-right text-base text-muted-foreground">
                Đã đếm:{""}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatVND(totalCounted)}
                </span>
              </div>
              <Button
                type="button"
                className="min-h-11"
                disabled={isPending || needsNoteForSubmit}
                onClick={handleSubmit}
              >
                {isPending ? (
                  <>
                    <Spinner data-icon="inline-start" /> Đang gửi
                  </>
                ) : varianceCtx ? (
                  <>
                    Chốt ca với chênh lệch{" "}
                    <IconArrowRight data-icon="inline-end" />
                  </>
                ) : (
                  <>
                    Đối soát <IconArrowRight data-icon="inline-end" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("count")}
                disabled={isPending}
              >
                <IconArrowLeft data-icon="inline-start" />
                Đếm lại
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1"
                onClick={handleConfirm}
              >
                <IconCircleCheck data-icon="inline-start" />
                Xác nhận & đóng ca
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
