"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatVND } from "@comtammatu/shared/format";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { BrandMark } from "@/components/brand";
import { FormattedNumberInput } from "@/components/form";
import { messages } from "@lib/messages";
import {
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { openPosSession } from "./actions";

interface PosTerminal {
  id: number;
  name: string;
  device_id: string | null;
  has_open_session: boolean;
}

interface SessionGateProps {
  branchId: number;
  /**
   * Per-branch model (Owner D7, 2026-04-27): list dùng để cảnh báo "branch
   * chưa có máy POS nào" (block mở ca). KHÔNG còn picker chọn máy — ca POS
   * giờ thuộc branch, không thuộc terminal.
   */
  terminals: PosTerminal[];
  /**
   * Tồn két cuối ca đóng gần nhất cùng branch (= tiền physically carry-over).
   * Server tự fetch và pass xuống. UI prefill input bằng giá trị này; nếu
   * cashier sửa khác → bắt buộc nhập lý do (carry-over enforcement).
   */
  expectedOpeningCash: number;
  hasPriorSession: boolean;
}

// Ngưỡng cảnh báo nhập tiền đầu ca quá lớn — chặn typo dạng "thừa số 0"
// (ví dụ session 2 history nhập 250.000.000đ thay vì 250.000đ). 50 triệu
// là upper bound an toàn cho một ca cơm tấm; tăng/giảm tùy quy mô tiệm.
const TYPO_GUARD_VND = 50_000_000;

export function SessionGate({
  branchId,
  terminals,
  expectedOpeningCash,
  hasPriorSession,
}: SessionGateProps) {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState<string>(
    String(expectedOpeningCash),
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [typoConfirmed, setTypoConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const cashAmount = Number(openingCash);
  const hasValidOpeningCash =
    openingCash.trim() !== "" && !Number.isNaN(cashAmount) && cashAmount >= 0;
  const branchHasTerminals = terminals.length > 0;

  const delta = cashAmount - expectedOpeningCash;
  const needsReason = hasValidOpeningCash && delta !== 0;
  const reasonOk = !needsReason || overrideReason.trim().length >= 3;
  const needsTypoConfirm = hasValidOpeningCash && cashAmount >= TYPO_GUARD_VND;

  const canOpen =
    branchHasTerminals &&
    hasValidOpeningCash &&
    reasonOk &&
    (!needsTypoConfirm || typoConfirmed) &&
    !isPending;

  const handleOpen = useCallback(() => {
    if (!canOpen) return;

    startTransition(async () => {
      // Auto-pick first active terminal cho audit metadata. Per-branch model
      // không bắt cashier chọn — UI 1-tap, terminal_id chỉ ghi sổ "máy nào
      // physically mở ca". Nếu cashier muốn pick chính xác, admin có thể
      // edit pos_terminals list (deactivate máy không dùng).
      const firstTerminal = terminals[0];
      const result = await openPosSession(
        branchId,
        cashAmount,
        firstTerminal?.id,
        needsReason ? overrideReason.trim() : undefined,
      );

      if (result.success) {
        toast.success(messages.pos.sessionGate.openSuccess);
        router.refresh();
      } else {
        toast.error(result.error ?? messages.pos.sessionGate.openFailed);
      }
    });
  }, [
    branchId,
    canOpen,
    cashAmount,
    needsReason,
    overrideReason,
    router,
    terminals,
  ]);

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
      <EmployeePortalBackControl className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6" />

      <div className="mx-auto flex w-full max-w-xl flex-1 items-center pt-12 sm:pt-0">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <Badge variant="outline" className="w-fit">
                  {messages.pos.sessionGate.branch(branchId)}
                </Badge>
                <CardTitle className="text-2xl">
                  {messages.pos.sessionGate.title}
                </CardTitle>
              </div>
              <BrandMark
                decorative
                className="size-11 shrink-0 rounded-md bg-card p-1 ring-1 ring-border"
              />
            </div>
          </CardHeader>

          <CardContent>
            <FieldGroup>
              {!branchHasTerminals ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>
                    {messages.pos.sessionGate.noTerminalTitle}
                  </AlertTitle>
                  <AlertDescription>
                    {messages.pos.sessionGate.noTerminalDescription}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Field data-invalid={!hasValidOpeningCash}>
                <FieldLabel htmlFor="opening-cash">
                  {messages.pos.sessionGate.openingCashLabel}
                </FieldLabel>
                <FormattedNumberInput
                  id="opening-cash"
                  maxFractionDigits={0}
                  value={openingCash}
                  onValueChange={(v) => {
                    setOpeningCash(v);
                    setTypoConfirmed(false);
                  }}
                  placeholder="0"
                  aria-invalid={!hasValidOpeningCash}
                />
                <FieldDescription>
                  {hasPriorSession
                    ? messages.pos.sessionGate.carryoverHint(
                        formatVND(expectedOpeningCash),
                      )
                    : messages.pos.sessionGate.carryoverNoPrior}
                </FieldDescription>
              </Field>

              {needsReason ? (
                <Field data-invalid={!reasonOk}>
                  <FieldLabel htmlFor="override-reason">
                    {messages.pos.sessionGate.overrideReasonLabel}
                  </FieldLabel>
                  <Textarea
                    id="override-reason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder={
                      messages.pos.sessionGate.overrideReasonPlaceholder
                    }
                    rows={3}
                    className="resize-none text-base"
                    aria-invalid={!reasonOk}
                  />
                  <FieldDescription>
                    {messages.pos.sessionGate.overrideReasonRequired}{" "}
                    {`Lệch ${formatVND(delta)} so với tồn ca trước.`}
                  </FieldDescription>
                </Field>
              ) : null}

              {needsTypoConfirm ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>
                    {messages.pos.sessionGate.typoConfirmTitle}
                  </AlertTitle>
                  <AlertDescription className="flex flex-col gap-2 text-current">
                    <span>
                      {messages.pos.sessionGate.typoConfirmBody(
                        formatVND(cashAmount),
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
                        {messages.pos.sessionGate.typoConfirmContinue}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setOpeningCash(String(expectedOpeningCash));
                          setTypoConfirmed(false);
                        }}
                      >
                        {messages.pos.sessionGate.typoConfirmCancel}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              size="lg"
              disabled={!canOpen}
              onClick={handleOpen}
            >
              {isPending ? (
                <>
                  <Spinner data-icon="inline-start" />
                  {messages.pos.sessionGate.opening}
                </>
              ) : (
                messages.pos.sessionGate.open
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
