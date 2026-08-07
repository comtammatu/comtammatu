"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Package,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Badge } from "@comtammatu/ui/components/badge";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import { AppDetailFooter } from "@/components/surface";
import { messages } from "@lib/messages";
import { toast } from "@comtammatu/ui/components/sonner";
import type { BranchDaySummary, CloseDaySessionRow } from "./data";
import { closeBranchDay } from "./actions";

const copy = messages.settings.branch;

function StepHeader({
  stepNumber,
  title,
  description,
  isComplete,
  icon: Icon,
}: {
  stepNumber: number;
  title: string;
  description: string;
  isComplete: boolean;
  icon: typeof Store;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b pb-2">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
            isComplete
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning"
          }`}
        >
          {stepNumber}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Badge variant={isComplete ? "success" : "warning"} className="shrink-0">
        {isComplete ? "Hoàn tất" : "Cần xử lý"}
      </Badge>
    </div>
  );
}

function SessionItem({ session }: { session: CloseDaySessionRow }) {
  return (
    <Item variant="outline" size="sm">
      <ItemContent>
        <ItemTitle className="text-sm font-medium">
          {session.terminal_name ?? "Ca chi nhánh"}
        </ItemTitle>
        <ItemDescription className="text-xs">
          {session.opened_by_name ?? "—"} · {formatVNTime(session.opened_at)}
          {session.closed_at ? ` → ${formatVNTime(session.closed_at)}` : ""}
        </ItemDescription>
        <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground pt-1">
          <span>
            {copy.closeDayCashLabel}:{" "}
            {formatVND(session.closing_cash ?? session.opening_cash)}
          </span>
          {session.cash_difference != null ? (
            <Badge
              variant={
                Math.abs(session.cash_difference) > 0
                  ? "warning"
                  : "secondary"
              }
            >
              {session.cash_difference >= 0 ? "+" : ""}
              {formatVND(session.cash_difference)}
            </Badge>
          ) : null}
        </span>
      </ItemContent>
    </Item>
  );
}

export function CloseDayClient({
  branchId,
  summary,
  sessions,
  businessDate,
  pendingWasteCount,
  pendingCountSlipsCount,
  pendingCheckoutsCount,
  loadFailed,
}: {
  branchId: number;
  summary: BranchDaySummary | null;
  sessions: CloseDaySessionRow[];
  businessDate: string;
  pendingWasteCount: number;
  pendingCountSlipsCount: number;
  pendingCheckoutsCount: number;
  loadFailed: boolean;
}) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const isClosed = summary?.is_closed === true;
  const openSessionCount = summary?.open_session_count ?? 0;
  const step1Complete = openSessionCount === 0;
  const step2Complete = pendingWasteCount === 0 && pendingCountSlipsCount === 0;
  const step3Complete = pendingCheckoutsCount === 0;

  const canClose =
    !isClosed && step1Complete && !loadFailed;

  async function handleClose() {
    const ok = await confirm({
      title: copy.closeDayConfirmTitle,
      description: copy.closeDayConfirmDescription,
      confirmText: copy.closeDaySubmit,
    });
    if (!ok) return;

    const closedSessions = sessions.filter((s) => s.status === "closed");
    const cashRecon = closedSessions.map((s) => ({
      sessionId: s.id,
      openingCash: s.opening_cash,
      expectedCash: s.expected_cash ?? 0,
      closingCash: s.closing_cash ?? 0,
      cashDifference: s.cash_difference ?? 0,
    }));

    startTransition(async () => {
      const result = await closeBranchDay({
        branchId,
        businessDate,
        cashRecon,
        note: note.trim() || undefined,
      });

      if (result.success) {
        toast.success(copy.closeDaySuccessToast);
      } else {
        toast.error(result.error ?? copy.closeDayErrorToast);
      }
    });
  }

  if (loadFailed) {
    return (
      <BranchOperatorPanel title={copy.closeDayTitle}>
        <NoteCallout tone="warning" title={copy.closeDayLoadFailedTitle}>
          {copy.closeDayLoadFailedBody}
        </NoteCallout>
      </BranchOperatorPanel>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Step 1: Đóng ca POS & Kiểm két */}
      <BranchOperatorPanel headingLevel="h2">
        <StepHeader
          stepNumber={1}
          title={copy.closeDayStep1Title}
          description={copy.closeDayStep1Desc}
          isComplete={step1Complete}
          icon={Store}
        />
        {openSessionCount > 0 ? (
          <NoteCallout tone="warning" className="mt-3">
            {copy.closeDayOpenSessionsWarning(openSessionCount)}
          </NoteCallout>
        ) : (
          <div className="flex items-center gap-2 pt-2 text-xs text-success">
            <CheckCircle2 className="size-4" />
            <span>{copy.closeDayStep1Success}</span>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{copy.closeDayNoSessions}</p>
          ) : (
            <ItemGroup className="gap-2">
              {sessions.map((session) => (
                <SessionItem key={session.id} session={session} />
              ))}
            </ItemGroup>
          )}
        </div>
      </BranchOperatorPanel>

      {/* Step 2: Duyệt kho & Hao hụt */}
      <BranchOperatorPanel headingLevel="h2">
        <StepHeader
          stepNumber={2}
          title={copy.closeDayStep2Title}
          description={copy.closeDayStep2Desc}
          isComplete={step2Complete}
          icon={Package}
        />
        <ItemGroup className="mt-3 gap-2">
          <Item
            variant="outline"
            size="sm"
            render={<Link href={`/br/${branchId}/stock/waste-approvals`} />}
          >
            <ItemMedia variant="icon" className="rounded-md bg-muted p-2">
              <CheckCircle2 className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-sm">{copy.closeDayStep2WasteTitle}</ItemTitle>
              <ItemDescription className="text-xs">
                {copy.closeDayPendingWasteText(pendingWasteCount)}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant={pendingWasteCount > 0 ? "warning" : "secondary"}>
                {pendingWasteCount}
              </Badge>
              <ChevronRight aria-hidden />
            </ItemActions>
          </Item>

          <Item
            variant="outline"
            size="sm"
            render={<Link href={`/br/${branchId}/stock/count-slips`} />}
          >
            <ItemMedia variant="icon" className="rounded-md bg-muted p-2">
              <ClipboardCheck className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-sm">{copy.closeDayStep2CountTitle}</ItemTitle>
              <ItemDescription className="text-xs">
                {copy.closeDayPendingCountSlipsText(pendingCountSlipsCount)}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant={pendingCountSlipsCount > 0 ? "warning" : "secondary"}>
                {pendingCountSlipsCount}
              </Badge>
              <ChevronRight aria-hidden />
            </ItemActions>
          </Item>
        </ItemGroup>
      </BranchOperatorPanel>

      {/* Step 3: Duyệt ca & Nhân sự */}
      <BranchOperatorPanel headingLevel="h2">
        <StepHeader
          stepNumber={3}
          title={copy.closeDayStep3Title}
          description={copy.closeDayStep3Desc}
          isComplete={step3Complete}
          icon={Users}
        />
        <ItemGroup className="mt-3 gap-2">
          <Item
            variant="outline"
            size="sm"
            render={<Link href={`/br/${branchId}/shift/checkout-approvals`} />}
          >
            <ItemMedia variant="icon" className="rounded-md bg-muted p-2">
              <Users className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-sm">{copy.closeDayStep3CheckoutTitle}</ItemTitle>
              <ItemDescription className="text-xs">
                {copy.closeDayPendingCheckoutsText(pendingCheckoutsCount)}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant={pendingCheckoutsCount > 0 ? "warning" : "secondary"}>
                {pendingCheckoutsCount}
              </Badge>
              <ChevronRight aria-hidden />
            </ItemActions>
          </Item>
        </ItemGroup>
      </BranchOperatorPanel>

      {/* Step 4: Tổng quan Doanh thu & Chốt sổ ngày */}
      <BranchOperatorPanel headingLevel="h2">
        <StepHeader
          stepNumber={4}
          title={copy.closeDayStep4Title}
          description={copy.closeDayStep4Desc}
          isComplete={isClosed}
          icon={ShieldCheck}
        />

        <div className="mt-3">
          <BranchOperatorStatusStrip
            items={[
              {
                label: copy.closeDayRevenueLabel,
                value: formatVND(summary?.revenue ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayCashRevenueLabel,
                value: formatVND(summary?.cash_revenue ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayNoncashRevenueLabel,
                value: formatVND(summary?.noncash_revenue ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayPaidOrdersLabel,
                value: String(summary?.paid_orders ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayUnpaidOrdersLabel,
                value: String(summary?.unpaid_orders ?? 0),
                mono: true,
              },
            ]}
          />
        </div>

        {isClosed ? (
          <ItemGroup className="mt-3">
            <Item variant="muted" size="sm">
              <ItemContent>
                <ItemTitle className="text-sm font-medium text-foreground">
                  {copy.closeDayAlreadyClosed} ({formatVNTime(summary?.closed_at ?? "")})
                </ItemTitle>
                {summary?.note ? (
                  <ItemDescription className="text-xs text-muted-foreground">
                    {summary.note}
                  </ItemDescription>
                ) : null}
              </ItemContent>
            </Item>
          </ItemGroup>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <label htmlFor="close-day-note" className="text-xs font-medium text-foreground">
              {copy.closeDayNoteLabel}
            </label>
            <Textarea
              id="close-day-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={copy.closeDayNotePlaceholder}
              maxLength={500}
              rows={3}
              disabled={isPending}
            />
          </div>
        )}
      </BranchOperatorPanel>

      {!isClosed ? (
        <AppDetailFooter
          sticky
          trailing={
            <Button
              size="touch"
              onClick={handleClose}
              disabled={!canClose || isPending}
              className="w-full sm:w-fit"
            >
              {copy.closeDaySubmit}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
