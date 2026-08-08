"use client";

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
import { Badge } from "@comtammatu/ui/components/badge";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
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
import { messages } from "@lib/messages";
import type { BranchDaySummary, CloseDaySessionRow } from "./data";

const copy = messages.settings.branch;

function SectionHeader({
  title,
  description,
  isComplete,
  icon: Icon,
}: {
  title: string;
  description: string;
  isComplete: boolean;
  icon: typeof Store;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b pb-2">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
            isComplete
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning"
          }`}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Badge variant={isComplete ? "success" : "warning"} className="shrink-0">
        {isComplete ? copy.closeDayStatusOk : copy.closeDayStatusAttention}
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
        <span className="flex items-center gap-2 pt-1 text-xs tabular-nums text-muted-foreground">
          <span>
            {copy.closeDayCashLabel}:{" "}
            {formatVND(session.closing_cash ?? session.opening_cash)}
          </span>
          {session.cash_difference != null ? (
            <Badge
              variant={
                Math.abs(session.cash_difference) > 0 ? "warning" : "secondary"
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
  const openSessionCount = summary?.open_session_count ?? 0;
  const posOk = openSessionCount === 0;
  const stockOk = pendingWasteCount === 0 && pendingCountSlipsCount === 0;
  const hrOk = pendingCheckoutsCount === 0;

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
      <BranchOperatorPanel headingLevel="h2">
        <SectionHeader
          title={copy.closeDayStep1Title}
          description={copy.closeDayStep1Desc}
          isComplete={posOk}
          icon={Store}
        />
        <NoteCallout tone="muted" className="mt-3 text-sm">
          {copy.closeDayCutoffNote}
        </NoteCallout>
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

      <BranchOperatorPanel headingLevel="h2">
        <SectionHeader
          title={copy.closeDayStep2Title}
          description={copy.closeDayStep2Desc}
          isComplete={stockOk}
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
              <Badge
                variant={pendingCountSlipsCount > 0 ? "warning" : "secondary"}
              >
                {pendingCountSlipsCount}
              </Badge>
              <ChevronRight aria-hidden />
            </ItemActions>
          </Item>
        </ItemGroup>
      </BranchOperatorPanel>

      <BranchOperatorPanel headingLevel="h2">
        <SectionHeader
          title={copy.closeDayStep3Title}
          description={copy.closeDayStep3Desc}
          isComplete={hrOk}
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
              <ItemTitle className="text-sm">
                {copy.closeDayStep3CheckoutTitle}
              </ItemTitle>
              <ItemDescription className="text-xs">
                {copy.closeDayPendingCheckoutsText(pendingCheckoutsCount)}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge
                variant={pendingCheckoutsCount > 0 ? "warning" : "secondary"}
              >
                {pendingCheckoutsCount}
              </Badge>
              <ChevronRight aria-hidden />
            </ItemActions>
          </Item>
        </ItemGroup>
      </BranchOperatorPanel>

      <BranchOperatorPanel headingLevel="h2">
        <SectionHeader
          title={copy.closeDayStep4Title}
          description={copy.closeDayStep4Desc}
          isComplete
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

        {summary?.is_closed === true && summary.closed_at ? (
          <ItemGroup className="mt-3">
            <Item variant="muted" size="sm">
              <ItemContent>
                <ItemTitle className="text-sm font-medium text-foreground">
                  {copy.closeDayHistoricalClosedNote} (
                  {formatVNTime(summary.closed_at)})
                </ItemTitle>
                {summary.note ? (
                  <ItemDescription className="text-xs text-muted-foreground">
                    {summary.note}
                  </ItemDescription>
                ) : null}
              </ItemContent>
            </Item>
          </ItemGroup>
        ) : null}
      </BranchOperatorPanel>
    </div>
  );
}
