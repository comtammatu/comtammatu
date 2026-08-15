"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: POS close-session sheet keeps cashier reconciliation copy inline */

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import {
  formatVND,
  parseVietnameseNumericInput,
} from "@comtammatu/shared/format";
import { WholeVndInput } from "@/components/form";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Separator } from "@comtammatu/ui/components/separator";

import { Textarea } from "@comtammatu/ui/components/textarea";
import { Progress } from "@comtammatu/ui/components/progress";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { CircleCheck as IconCircleCheck } from "lucide-react";
import { confirm } from "@/components/confirm-dialog";
import {
  StationSection,
  StationSheet,
} from "@/components/surface";
import { closePosSession } from "./actions";
import {
  DenominationInput,
  sumDenominations,
  type DenominationCounts,
} from "./_components/close-session/denomination-input";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
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
}

export function CloseSessionSheet({
  sessionId,
  open,
  onOpenChange,
}: CloseSessionSheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("count");
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [countMode, setCountMode] = useState<"total" | "denomination">("total");
  const [quickTotal, setQuickTotal] = useState<string>("");
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalCounted =
    countMode === "total"
      ? (() => {
          const parsed = parseVietnameseNumericInput(quickTotal);
          return parsed.state === "valid"
            ? Number.parseFloat(parsed.canonical) || 0
            : 0;
        })()
      : sumDenominations(counts);

  const reset = useCallback(() => {
    setStep("count");
    setCounts({});
    setCountMode("total");
    setQuickTotal("");
    setNote("");
    setSummary(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Closing a shift commits immediately and cannot be reopened (D8). The
    // confirm gate is the only safe-recovery path required by ui.md; cancel
    // returns to counting, which is truthful here (pre-commit).
    const ok = await confirm({
      title: "Chốt ca?",
      description:
        "Sau khi chốt, ca đóng ngay và không thể mở lại. Nếu lệch quỹ vượt ngưỡng, quản lý sẽ nhận cảnh báo tự động.",
      details: [{ label: "Tiền mặt đã đếm", value: formatVND(totalCounted) }],
      confirmText: "Chốt ca",
      cancelText: "Đếm lại",
    });
    if (!ok) return;
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
        // D8: a variance breach is only a warning, and shift-close print is
        // fail-soft. With a 1-slot toaster, separate warnings would evict the
        // success toast (and each other), so fold any warning into a single
        // toast that supersedes and stays longer; otherwise plain success.
        const warningLines: string[] = [];
        if (payload.variance_breached) {
          warningLines.push(
            `Lệch quỹ vượt ngưỡng (chênh lệch ${formatVND(
              payload.cash_difference,
            )} > ${formatVND(
              payload.variance_threshold,
            )}) — đã gửi cảnh báo cho quản lý.`,
          );
        }
        if (payload.print_warning) {
          warningLines.push(`Không in được phiếu chốt ca: ${payload.print_warning}`);
        }
        if (warningLines.length > 0) {
          toast.warning("Đã chốt ca", {
            description: warningLines.join(" "),
            duration: 8000,
          });
        } else {
          toast.success("Chốt ca thành công");
        }
        return;
      }

      toast.error(result.error ?? "Không thể chốt ca");
    });
  }, [note, sessionId, totalCounted]);

  // Shift already committed at step 1; this only dismisses the read-only
  // reconciliation summary and returns to the staff page.
  const handleConfirm = useCallback(() => {
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
    <StationSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={`Chốt ca · ${step === "count" ? "Đếm tiền mặt" : "Đối soát"}`}
      side="right"
      contentClassName="w-full data-[side=right]:w-full"
      footer={
        step === "count" ? (
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
                size="touch"
                className="px-4"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button
                type="button"
                size="touch"
                className="flex-1"
                disabled={isPending}
                onClick={() => void handleSubmit()}
              >
                {isPending ? (
                  <>
                    <Spinner data-icon="inline-start" /> Đang chốt ca
                  </>
                ) : (
                  "Chốt ca"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="touch"
            className="w-full"
            onClick={handleConfirm}
          >
            <IconCircleCheck data-icon="inline-start" />
            Xong
          </Button>
        )
      }
    >
      <Progress value={step === "count" ? 50 : 100} className="mb-4 h-2" />
            {step === "count" && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Chế độ đếm tiền mặt">
                  <Button
                    type="button"
                    variant={countMode === "total" ? "default" : "outline"}
                    size="touch"
                    aria-pressed={countMode === "total"}
                    onClick={() => setCountMode("total")}
                  >
                    Nhập tổng
                  </Button>
                  <Button
                    type="button"
                    variant={countMode === "denomination" ? "default" : "outline"}
                    size="touch"
                    aria-pressed={countMode === "denomination"}
                    onClick={() => setCountMode("denomination")}
                  >
                    Theo mệnh giá
                  </Button>
                </div>
                {countMode === "total" ? (
                  <StationSection
                    size="sm"
                    contentClassName="gap-2"
                    title="Tổng tiền mặt đếm được"
                  >
                    <Label htmlFor="quick-total" className="sr-only">
                      Tổng tiền mặt
                    </Label>
                    <WholeVndInput
                      id="quick-total"
                      value={quickTotal}
                      onValueChange={setQuickTotal}
                      disabled={isPending}
                      placeholder="0"
                      className="text-base"
                    />
                  </StationSection>
                ) : (
                  <DenominationInput
                    counts={counts}
                    onCountsChange={setCounts}
                    disabled={isPending}
                  />
                )}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="close-note"
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Ghi chú ca (tuỳ chọn)
                  </Label>
                  <Textarea
                    id="close-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: thu hộ khách lẻ 10k, đổi tờ rách..."
                    rows={3}
                    className="resize-none text-base"
                  />
                </div>
              </div>
            )}

            {step === "reconcile" && summary && (
              <div className="flex flex-col gap-4">
                <StationSection size="sm" contentClassName="gap-3 text-base">
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Kỳ vọng tồn quỹ
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatVND(summary.expected_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đã đếm được</span>
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
                  </>
                </StationSection>

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
                      ? "Ca đã chốt và số dư khớp hoàn toàn."
                      : !significantDiff
                        ? "Ca đã chốt; chênh lệch trong ngưỡng được giữ lại để đối chiếu."
                        : `Lệch quỹ vượt ngưỡng (> ${formatVND(summary.variance_threshold)}). Quản lý xử lý tại Lịch sử ca POS.`}
                  </AlertDescription>
                </Alert>

                <Alert>
                  <AlertDescription>
                    Tiền đếm và lệch lúc chốt đã được ghi lại, không cộng doanh thu lần hai.
                  </AlertDescription>
                </Alert>

                <Badge variant="outline" className="w-fit text-sm">
                  Tiền đầu ca: {formatVND(summary.opening_cash)}
                </Badge>
              </div>
            )}
    </StationSheet>
  );
}
