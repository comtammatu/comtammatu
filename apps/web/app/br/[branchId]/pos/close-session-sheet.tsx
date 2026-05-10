"use client";

import { useCallback, useState, useTransition } from "react";
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
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { closePosSession } from "./actions";
import {
  DenominationInput,
  sumDenominations,
  type DenominationCounts,
} from "./_components/close-session/denomination-input";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages as appMessages } from "@lib/messages";

// Ngưỡng cảnh báo nhập số tiền lớn bất thường — chặn typo "thừa số 0"
// (lịch sử có ca closing 250.000.000đ vs expected 275.000đ). 50 triệu
// là ngưỡng an toàn cho một ca cơm tấm; vượt → bắt cashier confirm
// trước khi đẩy lên server.
const TYPO_GUARD_VND = 50_000_000;
interface CloseSummary {
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_difference: number;
  /** Server-computed threshold = max(50.000đ, 0.5% × expected_cash). UI dùng
   * cho color tone + alert text — đảm bảo khớp với gate cảnh báo của RPC. */
  variance_threshold: number;
  /** Server flag: |diff| > threshold. Trigger notification cho manager đã
   * fire phía DB; UI chỉ hiện toast cho cashier biết. */
  variance_breached: boolean;
  order_count: number;
  opened_at: string;
  closed_at: string;
}

type Step = "count" | "reconcile";

function diffToneClass(diff: number, threshold: number): string {
  if (diff === 0) return "text-success";
  if (Math.abs(diff) <= threshold) return "text-warning";
  return "text-destructive";
}

interface CloseSessionSheetProps {
  sessionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** @deprecated D8 (2026-04-27) bỏ variance gate — prop giữ lại để
   * backward-compat với caller cũ; không còn ảnh hưởng UI. */
  canOverrideVariance?: boolean;
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
  const [typoConfirmed, setTypoConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalCounted = sumDenominations(counts);
  const needsTypoConfirm = totalCounted >= TYPO_GUARD_VND;

  const reset = useCallback(() => {
    setStep("count");
    setCounts({});
    setNote("");
    setSummary(null);
    setTypoConfirmed(false);
  }, []);

  const handleSubmit = useCallback(() => {
    startTransition(async () => {
      const result = await closePosSession(
        sessionId,
        totalCounted,
        note.trim() || undefined,
      );
      if (result.success && result.data) {
        const payload = result.data as CloseSummary & {
          print_warning?: string;
        };
        setSummary(payload);
        setStep("reconcile");
        // D8: variance breach giờ chỉ là cảnh báo. Server đã insert
        // notification cho manager qua trigger; UI báo cashier biết.
        if (payload.variance_breached) {
          toast.warning("Lệch quỹ vượt ngưỡng — đã gửi cảnh báo cho quản lý", {
            description: `Chênh lệch ${formatVND(
              payload.cash_difference,
            )} > ${formatVND(payload.variance_threshold)}.`,
          });
        }
        // Best-effort shift-close print is fail-soft inside the Server Action.
        if (payload.print_warning) {
          toast.warning("Không in được phiếu chốt ca", {
            description: payload.print_warning,
          });
        }
        return;
      }

      toast.error(result.error ?? "Không thể đóng ca");
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
    Math.abs(summary.cash_difference) > summary.variance_threshold;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader className="border-b px-3 pt-5 pb-3 text-left sm:px-5">
          <SheetTitle>
            Đóng ca · {step === "count" ? "Đếm tiền mặt" : "Đối soát"}
          </SheetTitle>
          <div className="mt-2">
            <Progress value={step === "count" ? 50 : 100} size="default" />
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 py-3 sm:px-5 sm:py-4">
            {step === "count" && (
              <div className="flex flex-col gap-4">
                <DenominationInput
                  counts={counts}
                  onCountsChange={(next) => {
                    setCounts(next);
                    setTypoConfirmed(false);
                  }}
                  disabled={isPending}
                />
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
                    Nếu lệch quỹ vượt ngưỡng, hệ thống sẽ tự động gửi cảnh báo
                    cho quản lý. Ca vẫn đóng bình thường.
                  </p>
                </div>
                {needsTypoConfirm && (
                  <Alert className="border-warning/20 bg-warning/10 text-warning">
                    <IconAlertTriangle />
                    <AlertDescription className="flex flex-col gap-2 text-current">
                      <span>
                        {appMessages.pos.sessionGate.typoConfirmBody(
                          formatVND(totalCounted),
                        )}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={typoConfirmed ? "outline" : "secondary"}
                          onClick={() => setTypoConfirmed(true)}
                          disabled={typoConfirmed}
                        >
                          {appMessages.pos.sessionGate.typoConfirmContinue}
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
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
                            diffToneClass(
                              summary.cash_difference,
                              summary.variance_threshold,
                            ),
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
                        : `Lệch quỹ vượt ngưỡng (> ${formatVND(summary.variance_threshold)}). Đã gửi cảnh báo cho quản lý.`}
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

        <div className="border-t px-3 py-3 sm:px-5 sm:py-4">
          {step === "count" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>Đã đếm</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatVND(totalCounted)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-4"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  {ACTIONS_VI.cancel}
                </Button>
                <Button
                  type="button"
                  className="min-h-11 flex-1"
                  disabled={isPending || (needsTypoConfirm && !typoConfirmed)}
                  onClick={handleSubmit}
                >
                  {isPending ? (
                    <>
                      <Spinner data-icon="inline-start" /> Đang gửi
                    </>
                  ) : (
                    <>
                      Đối soát <IconArrowRight data-icon="inline-end" />
                    </>
                  )}
                </Button>
              </div>
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
