"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft as IconArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Package,
  Users,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { getPaymentMethodLabelVi } from "@comtammatu/shared/labels";
import {
  addVNDateDays,
  formatVNDate,
  formatVNTime,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  BranchOperatorControlBar,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import type {
  BranchDayReport,
  CloseDayAttendanceRow,
  CloseDaySessionRow,
} from "./data";

const copy = messages.settings.branch;

const ITEM_SOURCE_LABEL: Record<string, string> = {
  main: copy.closeDayItemSourceMain,
  side: copy.closeDayItemSourceSide,
  modifier: copy.closeDayItemSourceModifier,
};

function moneyOrDash(value: number | null | undefined): string {
  if (value == null) return copy.closeDayUnavailable;
  return formatVND(value);
}

function SessionItem({
  branchId,
  session,
}: {
  branchId: number;
  session: CloseDaySessionRow;
}) {
  const isOpen = session.status === "open";
  return (
    <Item
      variant="outline"
      size="sm"
      render={
        <Link href={`/br/${branchId}/pos-sessions?session=${session.id}`} />
      }
    >
      <ItemContent>
        <ItemTitle className="text-sm font-medium">
          {session.terminal_name ?? copy.closeDayBranchSession}
        </ItemTitle>
        <ItemDescription className="text-xs">
          {session.opened_by_name ?? "—"} · {formatVNTime(session.opened_at)}
          {session.closed_at ? ` → ${formatVNTime(session.closed_at)}` : ""}
        </ItemDescription>
        <span className="flex flex-wrap items-center gap-2 pt-1 text-xs tabular-nums text-muted-foreground">
          <span>
            {copy.closeDayOpeningCash}: {formatVND(session.opening_cash)}
          </span>
          {session.expected_cash != null ? (
            <span>
              {copy.closeDayExpectedCash}: {formatVND(session.expected_cash)}
            </span>
          ) : null}
          {session.closing_cash != null ? (
            <span>
              {copy.closeDayClosingCash}: {formatVND(session.closing_cash)}
            </span>
          ) : (
            <Badge variant="warning">{copy.closeDaySessionOpen}</Badge>
          )}
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
          {isOpen ? null : (
            <Badge variant="secondary">{copy.closeDaySessionClosed}</Badge>
          )}
        </span>
      </ItemContent>
      <ItemActions>
        <ChevronRight aria-hidden />
      </ItemActions>
    </Item>
  );
}

export function CloseDayClient({
  branchId,
  report,
  sessions,
  attendance,
  businessDate,
  todayBusinessDate,
  pendingWasteCount,
  pendingCountSlipsCount,
  pendingCheckoutsCount,
  loadFailed,
}: {
  branchId: number;
  report: BranchDayReport | null;
  sessions: CloseDaySessionRow[];
  attendance: CloseDayAttendanceRow[];
  businessDate: string;
  todayBusinessDate: string;
  pendingWasteCount: number;
  pendingCountSlipsCount: number;
  pendingCheckoutsCount: number;
  loadFailed: boolean;
}) {
  const [itemSort, setItemSort] = useState<"qty" | "revenue">("qty");
  const prevDate = addVNDateDays(businessDate, -1);
  const nextDate = addVNDateDays(businessDate, 1);
  const canGoNext = businessDate < todayBusinessDate;
  const openSessions = sessions.filter((row) => row.status === "open");
  const closedSessions = sessions.filter((row) => row.status !== "open");
  const attentionCount =
    (report?.open_session_count ?? 0) +
    pendingWasteCount +
    pendingCountSlipsCount +
    pendingCheckoutsCount;

  const topItems = useMemo(() => {
    const items = [...(report?.top_items ?? [])];
    items.sort((a, b) =>
      itemSort === "qty"
        ? b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name)
        : b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name),
    );
    return items;
  }, [itemSort, report?.top_items]);

  const mixEntries = Object.entries(report?.payment_mix ?? {});

  const dateNav = (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-2">
      <Button
        variant="ghost"
        size="icon-touch"
        className="shrink-0"
        aria-label={copy.closeDayPrevDate}
        render={<Link href={`/br/${branchId}/close-day?date=${prevDate}`} />}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-0 flex-1 truncate text-center text-sm font-medium tabular-nums">
        {formatVNDate(businessDate)}
      </span>
      {canGoNext ? (
        <Button
          variant="ghost"
          size="icon-touch"
          className="shrink-0"
          aria-label={copy.closeDayNextDate}
          render={<Link href={`/br/${branchId}/close-day?date=${nextDate}`} />}
        >
          <ChevronRight />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-touch"
          className="shrink-0"
          disabled
          aria-label={copy.closeDayNextDate}
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  );

  if (loadFailed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link href={`/br/${branchId}`} aria-label={ACTIONS_VI.back} />
            }
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{copy.closeDayTitle}</p>
          </div>
        </BranchOperatorControlBar>
        <BranchOperatorPanel title={copy.closeDayTitle}>
          <NoteCallout tone="warning" title={copy.closeDayLoadFailedTitle}>
            {copy.closeDayLoadFailedBody}
          </NoteCallout>
        </BranchOperatorPanel>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={
            <Link href={`/br/${branchId}`} aria-label={ACTIONS_VI.back} />
          }
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{copy.closeDayTitle}</p>
        </div>
      </BranchOperatorControlBar>
      {dateNav}
      <p className="text-xs text-muted-foreground">{copy.closeDayCutoffNote}</p>

      {attentionCount > 0 ? (
        <NoteCallout tone="warning" title={copy.closeDayAttentionTitle}>
          {copy.closeDayAttentionBody(
            report?.open_session_count ?? 0,
            pendingWasteCount,
            pendingCountSlipsCount,
            pendingCheckoutsCount,
          )}
        </NoteCallout>
      ) : null}

      <BranchOperatorPanel headingLevel="h2">
        <SectionLabel>{copy.closeDayResultTitle}</SectionLabel>
        <div className="mt-3">
          <BranchOperatorStatusStrip
            items={[
              {
                label: copy.closeDayNetRevenueLabel,
                value: formatVND(report?.net_revenue ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayFoodCostLabel,
                value: moneyOrDash(report?.food_cost),
                mono: true,
                muted: report?.food_cost == null,
              },
              {
                label: copy.closeDayGrossProfitLabel,
                value: moneyOrDash(report?.gross_profit),
                mono: true,
                muted: report?.gross_profit == null,
              },
              {
                label: copy.closeDayGrossMarginLabel,
                value:
                  report?.gross_margin == null
                    ? copy.closeDayUnavailable
                    : formatPercent(report.gross_margin),
                mono: true,
                muted: report?.gross_margin == null,
              },
            ]}
          />
        </div>
        <div className="mt-3">
          <BranchOperatorStatusStrip
            items={[
              {
                label: copy.closeDayOperatingResultLabel,
                value: moneyOrDash(report?.operating_result),
                mono: true,
                muted: report?.operating_result == null,
              },
              {
                label: copy.closeDayGoodsInLabel,
                value: moneyOrDash(report?.goods_in),
                mono: true,
                muted: report?.goods_in == null,
              },
              {
                label: copy.closeDayOpexLabel,
                value: formatVND(report?.operating_expense ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayInventoryChangeLabel,
                value: moneyOrDash(report?.inventory_change),
                mono: true,
                muted: report?.inventory_change == null,
              },
            ]}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {copy.closeDayOpexCaption}
        </p>
      </BranchOperatorPanel>

      <BranchOperatorPanel headingLevel="h2">
        <SectionLabel>{copy.closeDayCollectedTitle}</SectionLabel>
        <div className="mt-3">
          <BranchOperatorStatusStrip
            items={[
              {
                label: copy.closeDayRevenueLabel,
                value: formatVND(report?.money_collected ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayCashRevenueLabel,
                value: formatVND(report?.cash_revenue ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayNoncashRevenueLabel,
                value: formatVND(report?.noncash_revenue ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayPaidOrdersLabel,
                value: String(report?.paid_orders ?? 0),
                mono: true,
              },
              {
                label: copy.closeDayUnpaidOrdersLabel,
                value: String(report?.unpaid_orders ?? 0),
                mono: true,
              },
            ]}
          />
        </div>
        {mixEntries.length > 0 ? (
          <ItemGroup className="mt-3 gap-2">
            {mixEntries.map(([method, amount]) => (
              <Item key={method} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle className="text-sm">
                    {getPaymentMethodLabelVi(method)}
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <span className="font-mono text-sm tabular-nums">
                    {formatVND(amount)}
                  </span>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : null}
      </BranchOperatorPanel>

      <BranchOperatorPanel headingLevel="h2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <SectionLabel className="min-w-0 truncate">
            {copy.closeDayTopItemsTitle}
          </SectionLabel>
          <div className="flex shrink-0 gap-1">
            <Button
              variant={itemSort === "qty" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setItemSort("qty")}
            >
              {copy.closeDaySortQty}
            </Button>
            <Button
              variant={itemSort === "revenue" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setItemSort("revenue")}
            >
              {copy.closeDaySortRevenue}
            </Button>
          </div>
        </div>
        {topItems.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {copy.closeDayTopItemsEmpty}
          </p>
        ) : (
          <ItemGroup className="mt-3 gap-2">
            {topItems.map((item) => (
              <Item
                key={`${item.source}-${item.name}`}
                variant="outline"
                size="sm"
              >
                <ItemContent>
                  <ItemTitle className="text-sm">{item.name}</ItemTitle>
                  <ItemDescription className="text-xs">
                    {ITEM_SOURCE_LABEL[item.source] ?? copy.closeDayItemSourceMain} · {item.qty}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="font-mono text-sm tabular-nums">
                    {formatVND(item.revenue)}
                  </span>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </BranchOperatorPanel>

      <BranchOperatorPanel headingLevel="h2">
        <SectionLabel>{copy.closeDaySessionsTitle}</SectionLabel>
        <div className="mt-3 flex flex-col gap-2">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{copy.closeDayNoSessions}</p>
          ) : (
            <ItemGroup className="gap-2">
              {openSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  branchId={branchId}
                  session={session}
                />
              ))}
              {closedSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  branchId={branchId}
                  session={session}
                />
              ))}
            </ItemGroup>
          )}
        </div>
      </BranchOperatorPanel>

      <BranchOperatorPanel headingLevel="h2">
        <SectionLabel>{copy.closeDayStockTitle}</SectionLabel>
        <div className="mt-3">
          <BranchOperatorStatusStrip
            items={[
              {
                label: copy.closeDaySaleConsumptionLabel,
                value: moneyOrDash(report?.sale_consumption_value),
                mono: true,
                muted: report?.sale_consumption_value == null,
              },
              {
                label: copy.closeDayManualConsumptionLabel,
                value: moneyOrDash(report?.manual_consumption_value),
                mono: true,
                muted: report?.manual_consumption_value == null,
              },
              {
                label: copy.closeDayWasteValueLabel,
                value: moneyOrDash(report?.waste_value),
                mono: true,
                muted: report?.waste_value == null,
              },
            ]}
          />
        </div>
        <ItemGroup className="mt-3 gap-2">
          <Item
            variant="outline"
            size="sm"
            render={<Link href={`/br/${branchId}/stock/waste-approvals`} />}
          >
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
              <Package className="size-4" aria-hidden />
            </ItemActions>
          </Item>
          <Item
            variant="outline"
            size="sm"
            render={<Link href={`/br/${branchId}/stock/count-slips`} />}
          >
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
              <ClipboardCheck className="size-4" aria-hidden />
            </ItemActions>
          </Item>
        </ItemGroup>
      </BranchOperatorPanel>

      <BranchOperatorPanel headingLevel="h2">
        <SectionLabel>{copy.closeDayAttendanceTitle}</SectionLabel>
        <ItemGroup className="mt-3 gap-2">
          {attendance.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {copy.closeDayNoAttendance}
            </p>
          ) : (
            attendance.map((row) => (
              <Item
                key={row.id}
                variant="outline"
                size="sm"
                render={<Link href={`/br/${branchId}/team`} />}
              >
                <ItemContent>
                  <ItemTitle className="text-sm">{row.fullName}</ItemTitle>
                  <ItemDescription className="text-xs">
                    {[row.positionLabel, row.shiftName]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {" · "}
                    {row.checkIn ? formatVNTime(row.checkIn) : "—"}
                    {row.checkOut ? ` → ${formatVNTime(row.checkOut)}` : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {row.checkoutPending ? (
                    <Badge variant="warning">{copy.closeDayCheckoutPending}</Badge>
                  ) : row.checkOut ? (
                    <Badge variant="secondary">{copy.closeDayCheckedOut}</Badge>
                  ) : (
                    <Badge variant="info">{copy.closeDayWorking}</Badge>
                  )}
                  <Users className="size-4" aria-hidden />
                </ItemActions>
              </Item>
            ))
          )}
          <Item
            variant="outline"
            size="sm"
            render={<Link href={`/br/${branchId}/team/checkout-approvals`} />}
          >
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
    </div>
  );
}
