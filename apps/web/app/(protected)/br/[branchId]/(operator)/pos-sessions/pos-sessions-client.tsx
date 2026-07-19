"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote as IconCash,
  Clock as IconClock,
  Receipt as IconReceipt,
  CookingPot as IconToolsKitchen2,
  AlertTriangle as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { AppEmptyState, AppSection } from "@/components/surface";
import { BranchOperatorFrame } from "@lib/branch-operator/components/branch-operator-page";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import {
  formatCount,
  formatPercent,
  formatVND,
} from "@comtammatu/shared/format";
import { getPaymentMethodLabelVi } from "@comtammatu/shared/labels";
import {
  formatVNDateTime,
  formatVNDuration,
  formatVNTime,
} from "@comtammatu/shared/time";
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Progress } from "@comtammatu/ui/components/progress";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import type { CartModifier, CartSide } from "../../pos/types";
import type { PosSessionReport } from "./report-actions";
import { resolvePosSessionVariance } from "./actions";
import { correctPaymentMethod } from "@/(protected)/finance/payment-method-actions";
import { messages } from "@lib/messages";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { toast } from "@comtammatu/ui/components/sonner";

export interface PosSessionRow {
  id: number;
  // Per-branch model (D7): nullable. NULL = branch-wide session, not tied
  // to a specific physical terminal.
  terminal_id: number | null;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  status: string;
  note: string | null;
  variance_approval_note: string | null;
  variance_approver_user_id: string | null;
  variance_resolution_type: "staff_repaid" | "accepted_adjustment" | null;
  variance_settlement_amount: number | null;
  variance_resolved_at: string | null;
  pos_terminals: { name: string } | null;
  opened_by_profile: { full_name: string } | null;
  closed_by_profile: { full_name: string } | null;
}

/** Terminal name is preferred; branch-wide sessions fall back to shared copy. */
function resolveSessionLabel(session: PosSessionRow): string {
  if (session.pos_terminals?.name) return session.pos_terminals.name;
  if (session.terminal_id != null) return `POS #${String(session.terminal_id)}`;
  return messages.settings.posSessions.branchSharedSession;
}

interface PosSessionOrderItem {
  id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  modifiers: CartModifier[];
  sides: CartSide[];
  note: string | null;
  status: string;
}

interface PosSessionPayment {
  id: number;
  amount: number;
  method: string;
  status: string;
  paid_at: string | null;
}

export interface PosSessionOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  total_amount: number;
  note: string | null;
  created_at: string;
  table_id: number | null;
  tables: { number: number } | null;
  order_items: PosSessionOrderItem[];
  payments: PosSessionPayment[];
}

interface PosSessionsClientProps {
  branchId: number;
  sessions: PosSessionRow[];
  selectedSessionId: number | null;
  orders: PosSessionOrder[];
  report: PosSessionReport | null;
  canCorrectPaymentMethod: boolean;
}

function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  return getPaymentMethodLabelVi(method);
}

/** Mirrors the close-session threshold for older rows without report payloads. */
function computeVarianceThreshold(expectedCash: number | null): number {
  if (expectedCash == null) return 50_000;
  return Math.max(50_000, Math.round(expectedCash * 0.005 * 100) / 100);
}

function isVarianceBreached(session: PosSessionRow): boolean {
  if (session.cash_difference == null) return false;
  const threshold = computeVarianceThreshold(session.expected_cash);
  return Math.abs(session.cash_difference) > threshold;
}

function isVarianceResolved(session: PosSessionRow): boolean {
  return (
    session.variance_resolution_type != null &&
    session.variance_resolved_at != null &&
    session.variance_approval_note != null
  );
}

export function PosSessionsClient({
  branchId,
  sessions,
  selectedSessionId,
  orders,
  report,
  canCorrectPaymentMethod,
}: PosSessionsClientProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const openSessionCount = sessions.filter(
    (session) => session.status === "open",
  ).length;
  const unresolvedVarianceCount = sessions.filter(
    (session) =>
      isVarianceBreached(session) &&
      session.status !== "open" &&
      !isVarianceResolved(session),
  ).length;

  const summary = useMemo(() => buildSummary(orders), [orders]);

  if (sessions.length === 0) {
    return (
      <AppEmptyState
        title={messages.settings.posSessions.emptyTitle}
        description={messages.settings.posSessions.emptyDescription}
        symbol="roof"
      />
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
      <div className="order-2 min-w-0 xl:order-1">
        <SessionHistoryPanel
          branchId={branchId}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          openSessionCount={openSessionCount}
          unresolvedVarianceCount={unresolvedVarianceCount}
        />
      </div>

      <div className="order-1 flex min-w-0 flex-col gap-3 xl:order-2">
        {selectedSession ? (
          <>
            <SessionDetailCard
              branchId={branchId}
              session={selectedSession}
              summary={summary}
              onCloseShift={() => {}}
            />

            <AppSection
              title={messages.settings.posSessions.billsInSession(
                orders.length,
              )}
              description={messages.settings.posSessions.billsDescription}
              contentFlush
              contentScroll
            >
              {orders.length > 0 ? (
                <ItemGroup>
                  {orders.map((order) => (
                    <Item
                      key={order.id}
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <ItemHeader>
                        <ItemContent>
                          <ItemTitle>{order.order_number}</ItemTitle>
                          <ItemDescription>
                            {formatTime(order.created_at)} ·{" "}
                            {order.order_type === "dine_in"
                              ? messages.settings.posSessions.tableContext(
                                  order.tables?.number ?? "-",
                                )
                              : messages.settings.posSessions.takeaway}
                          </ItemDescription>
                        </ItemContent>
                        <IconChevronRight className="size-4 text-muted-foreground" />
                      </ItemHeader>
                      <ItemFooter>
                        <StatusBadge domain="order" value={order.status} />
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {formatVND(order.total_amount)}
                        </span>
                      </ItemFooter>
                    </Item>
                  ))}
                </ItemGroup>
              ) : (
                <AppEmptyState
                  title={messages.settings.posSessions.noBills}
                  compact
                  symbol="riceBowl"
                />
              )}
            </AppSection>
          </>
        ) : null}
      </div>

      <div className="order-3 min-w-0 xl:col-start-2 2xl:col-start-3 2xl:row-start-1">
        {report ? <SessionReportCard report={report} /> : null}
      </div>

      {selectedSession ? <div /> : null}

      <OrderDetailDrawer
        order={selectedOrder}
        canCorrectPaymentMethod={canCorrectPaymentMethod}
        open={selectedOrder !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedOrderId(null);
        }}
      />
    </div>
  );
}

function SessionHistoryPanel({
  branchId,
  sessions,
  selectedSessionId,
  openSessionCount,
  unresolvedVarianceCount,
}: {
  branchId: number;
  sessions: PosSessionRow[];
  selectedSessionId: number | null;
  openSessionCount: number;
  unresolvedVarianceCount: number;
}) {
  return (
    <AppSection
      title={messages.settings.posSessions.sessionHistory}
      description={messages.settings.posSessions.sessionHistoryDescription(
        openSessionCount,
        unresolvedVarianceCount,
      )}
      badge={{
        children: messages.settings.posSessions.sessionCount(sessions.length),
        variant: "secondary",
      }}
      className="h-fit"
      contentClassName="gap-2"
    >
      {sessions.map((session) => {
        const selected = session.id === selectedSessionId;
        const breached = isVarianceBreached(session);
        const resolved = breached && isVarianceResolved(session);
        return (
          <Button
            key={session.id}
            variant={selected ? "secondary" : "ghost"}
            size="touch-lg"
            className="w-full justify-start text-left"
            render={
              <Link
                href={`/br/${branchId}/pos-sessions?session=${session.id}`}
                aria-current={selected ? "page" : undefined}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-3"
              />
            }
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <IconClock className="size-5" />
            </span>
            <span className="min-w-0 flex-1 basis-40">
              <span className="block truncate text-sm font-semibold">
                {resolveSessionLabel(session)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatDateTime(session.opened_at)}
              </span>
              {session.cash_difference != null ? (
                <span
                  className={cn(
                    "mt-1 block text-xs font-medium tabular-nums",
                    breached && !resolved
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {messages.settings.posSessions.sessionVarianceLine(
                    formatVND(session.cash_difference),
                  )}
                </span>
              ) : null}
            </span>
            <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              {breached ? (
                <Badge variant={resolved ? "outline" : "destructive"}>
                  {resolved
                    ? messages.settings.posSessions.varianceResolvedShort
                    : messages.settings.posSessions.varianceShort}
                </Badge>
              ) : null}
              <Badge
                variant={session.status === "open" ? "warning" : "outline"}
              >
                {session.status === "open"
                  ? messages.settings.posSessions.open
                  : messages.settings.posSessions.closed}
              </Badge>
            </span>
          </Button>
        );
      })}
    </AppSection>
  );
}

interface SessionSummary {
  billCount: number;
  revenue: number;
  servedItems: number;
  cashRevenue: number;
  noncashRevenue: number;
  paidCount: number;
  unpaidCount: number;
  cancelledCount: number;
  paymentBreakdown: Array<{ method: string; count: number; amount: number }>;
}

function SessionDetailCard({
  branchId,
  session,
  summary,
  onCloseShift,
}: {
  branchId: number;
  session: PosSessionRow;
  summary: SessionSummary;
  onCloseShift: () => void;
}) {
  const router = useRouter();
  const breached = isVarianceBreached(session);
  const resolved = breached && isVarianceResolved(session);
  const threshold = computeVarianceThreshold(session.expected_cash);
  const isOpen = session.status === "open";
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionType, setResolutionType] = useState<
    "staff_repaid" | "accepted_adjustment" | null
  >(null);
  const [isResolving, startResolving] = useTransition();
  const trimmedResolutionNote = resolutionNote.trim();
  const canResolve =
    breached &&
    !isOpen &&
    !resolved &&
    resolutionType != null &&
    trimmedResolutionNote.length >= 10 &&
    trimmedResolutionNote.length <= 500 &&
    !isResolving;

  function handleResolveVariance() {
    if (!canResolve || resolutionType == null) return;
    const selectedResolutionType = resolutionType;

    startResolving(async () => {
      const result = await resolvePosSessionVariance(
        branchId,
        session.id,
        selectedResolutionType,
        trimmedResolutionNote,
      );
      if (!result.success) {
        toast.error(
          result.error ?? messages.settings.posSessions.resolveFailed,
        );
        return;
      }

      toast.success(messages.settings.posSessions.resolveSuccess);
      setResolutionNote("");
      setResolutionType(null);
      router.refresh();
    });
  }

  return (
    <AppSection
      title={messages.settings.posSessions.settlementTitle}
      description={
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">
            {resolveSessionLabel(session)}
          </p>
          <p>
            {messages.settings.posSessions.openedBy(
              session.opened_by_profile?.full_name ?? "—",
              formatDateTime(session.opened_at),
            )}
          </p>
          {!isOpen ? (
            <p>
              {messages.settings.posSessions.closedBy(
                session.closed_by_profile?.full_name ?? "—",
                formatDateTime(session.closed_at),
                formatDuration(session.opened_at, session.closed_at),
              )}
            </p>
          ) : null}
        </div>
      }
      badge={{
        children: isOpen
          ? messages.settings.posSessions.open
          : messages.settings.posSessions.closed,
        variant: isOpen ? "warning" : "outline",
      }}
      action={
        isOpen ? (
          <Button size="touch" onClick={onCloseShift}>
            {messages.settings.posSessions.closeShift}
          </Button>
        ) : null
      }
    >
      {breached ? (
        <Alert
          variant={resolved ? "default" : "destructive"}
          className={
            resolved
              ? "border-success/20 bg-success/10 text-success"
              : undefined
          }
        >
          <IconAlertTriangle className="size-4" />
          <AlertDescription className="text-current">
            <strong>
              {resolved
                ? messages.settings.posSessions.varianceResolvedStrong
                : messages.settings.posSessions.varianceAlertStrong}
            </strong>
            {resolved
              ? messages.settings.posSessions.varianceResolved(
                  formatVND(session.cash_difference ?? 0),
                )
              : messages.settings.posSessions.varianceAlert(
                  formatVND(session.cash_difference ?? 0),
                  formatVND(threshold),
                )}
            {session.variance_approval_note ? (
              <span className="mt-1 block text-sm">
                {messages.settings.posSessions.varianceApprovalNote(
                  session.variance_approval_note,
                )}
              </span>
            ) : null}
            {resolved && session.variance_resolution_type === "staff_repaid" ? (
              <span className="mt-1 block text-sm">
                {messages.settings.posSessions.staffRepaidResult(
                  formatVND(session.variance_settlement_amount ?? 0),
                )}
              </span>
            ) : null}
            {resolved &&
            session.variance_resolution_type === "accepted_adjustment" ? (
              <span className="mt-1 block text-sm">
                {messages.settings.posSessions.acceptedAdjustmentResult(
                  formatVND(session.cash_difference ?? 0),
                )}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : !isOpen && (session.cash_difference ?? 0) === 0 ? (
        <Alert className="border-success/20 bg-success/10 text-success">
          <IconCircleCheck className="size-4" />
          <AlertDescription className="text-current">
            {messages.settings.posSessions.cashMatched}
          </AlertDescription>
        </Alert>
      ) : null}

      {breached && !isOpen && !resolved ? (
        <div className="flex flex-col gap-2">
          <Label>{messages.settings.posSessions.varianceResolutionType}</Label>
          <div className="grid gap-2 lg:grid-cols-2">
            {(session.cash_difference ?? 0) < 0 ? (
              <Button
                type="button"
                variant={
                  resolutionType === "staff_repaid" ? "secondary" : "outline"
                }
                className="h-auto justify-start whitespace-normal py-3 text-left"
                onClick={() => setResolutionType("staff_repaid")}
              >
                <span>
                  <span className="block font-medium">
                    {messages.settings.posSessions.staffRepaid}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {messages.settings.posSessions.staffRepaidHint(
                      formatVND(Math.abs(session.cash_difference ?? 0)),
                    )}
                  </span>
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant={
                resolutionType === "accepted_adjustment"
                  ? "secondary"
                  : "outline"
              }
              className="h-auto justify-start whitespace-normal py-3 text-left"
              onClick={() => setResolutionType("accepted_adjustment")}
            >
              <span>
                <span className="block font-medium">
                  {messages.settings.posSessions.acceptedAdjustment}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {messages.settings.posSessions.acceptedAdjustmentHint}
                </span>
              </span>
            </Button>
          </div>
          <Label htmlFor={`variance-resolution-${String(session.id)}`}>
            {messages.settings.posSessions.varianceResolutionLabel}
          </Label>
          <Textarea
            id={`variance-resolution-${String(session.id)}`}
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder={
              messages.settings.posSessions.varianceResolutionPlaceholder
            }
            maxLength={500}
            rows={3}
            className="resize-none text-base"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {messages.settings.posSessions.varianceResolutionCount(
                trimmedResolutionNote.length,
              )}
            </span>
            <Button
              type="button"
              size="touch"
              disabled={!canResolve}
              onClick={handleResolveVariance}
            >
              {isResolving ? (
                <>
                  <Spinner data-icon="inline-start" />
                  {messages.settings.posSessions.resolving}
                </>
              ) : (
                messages.settings.posSessions.resolveVariance
              )}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<IconReceipt className="size-4" />}
          label={messages.settings.posSessions.totalBills}
          value={formatCount(summary.billCount)}
        />
        <Metric
          icon={<IconCash className="size-4" />}
          label={messages.settings.posSessions.paidRevenue}
          value={formatVND(summary.revenue)}
        />
        <Metric
          icon={<IconToolsKitchen2 className="size-4" />}
          label={messages.settings.posSessions.servedItems}
          value={formatCount(summary.servedItems)}
        />
        <Metric
          icon={<IconCash className="size-4" />}
          label={messages.settings.posSessions.cashVariance}
          value={
            session.cash_difference == null
              ? messages.settings.posSessions.notClosed
              : formatVND(session.cash_difference)
          }
          tone={
            session.cash_difference == null
              ? "muted"
              : session.cash_difference === 0
                ? "success"
                : breached
                  ? "destructive"
                  : "warning"
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <CashLine
          label={messages.settings.posSessions.openingCash}
          value={session.opening_cash}
        />
        <CashLine
          label={messages.settings.posSessions.expectedCash}
          value={session.expected_cash}
        />
        <CashLine
          label={messages.settings.posSessions.countedCash}
          value={session.closing_cash}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {messages.settings.posSessions.cashFormula}
      </p>

      <Separator />

      <div className="grid gap-3 text-sm lg:grid-cols-2 xl:grid-cols-4">
        <KV
          label={messages.settings.posSessions.cashCollected}
          value={formatVND(summary.cashRevenue)}
        />
        <KV
          label={messages.settings.posSessions.bankTransfer}
          value={formatVND(summary.noncashRevenue)}
        />
        <KV
          label={messages.settings.posSessions.paidOrders}
          value={formatCount(summary.paidCount)}
        />
        <KV
          label={messages.settings.posSessions.unpaidOrders}
          value={formatCount(summary.unpaidCount)}
        />
      </div>

      {summary.paymentBreakdown.length > 0 ? (
        <Item variant="muted" className="block">
          <ItemHeader>
            <ItemTitle className="text-xs uppercase text-muted-foreground">
              {messages.settings.posSessions.paymentBreakdown}
            </ItemTitle>
          </ItemHeader>
          <div className="grid gap-1 text-sm">
            {summary.paymentBreakdown.map((row) => (
              <div
                key={row.method}
                className="flex items-center justify-between"
              >
                <span>
                  {messages.settings.posSessions.methodCount(
                    paymentMethodLabel(row.method),
                    row.count,
                  )}
                </span>
                <span className="font-medium tabular-nums">
                  {formatVND(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </Item>
      ) : null}

      {summary.cancelledCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {messages.settings.posSessions.cancelledOrders(
            summary.cancelledCount,
          )}
        </p>
      ) : null}

      {session.note ? (
        <NoteCallout label={messages.settings.posSessions.sessionNote}>
          {session.note}
        </NoteCallout>
      ) : null}
    </AppSection>
  );
}

const ITEM_SOURCE_LABEL: Record<"main" | "side" | "modifier", string> = {
  main: messages.settings.posSessions.mainItem,
  side: messages.settings.posSessions.sideCombo,
  modifier: messages.settings.posSessions.modifier,
};

function formatHourRange(hour: number): string {
  const start = `${hour.toString().padStart(2, "0")}:00`;
  const end = `${((hour + 1) % 24).toString().padStart(2, "0")}:00`;
  return `${start}–${end}`;
}

function SessionReportCard({ report }: { report: PosSessionReport }) {
  const {
    totals,
    top_items,
    category_breakdown,
    aov_bins,
    peak_hour,
    discounts,
  } = report;
  const maxBinCount = Math.max(1, ...aov_bins.map((b) => b.count));
  const maxCategoryRevenue = Math.max(
    1,
    ...category_breakdown.map((c) => c.revenue),
  );

  return (
    <AppSection
      title={messages.settings.posSessions.reportTitle}
      description={messages.settings.posSessions.reportDescription}
      contentClassName="gap-4"
    >
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<IconReceipt className="size-4" />}
          label={messages.settings.posSessions.aov}
          value={formatVND(totals.aov)}
        />
        <Metric
          icon={<IconToolsKitchen2 className="size-4" />}
          label={messages.settings.posSessions.totalItems}
          value={formatCount(totals.total_items)}
        />
        <Metric
          icon={<IconAlertTriangle className="size-4" />}
          label={messages.settings.posSessions.voidItems}
          value={formatCount(totals.void_item_count)}
          tone={totals.void_item_count > 0 ? "warning" : "muted"}
        />
        <Metric
          icon={<IconClock className="size-4" />}
          label={messages.settings.posSessions.peakHour}
          value={
            peak_hour
              ? messages.settings.posSessions.peakHourValue(
                  formatHourRange(peak_hour.hour),
                  peak_hour.order_count,
                )
              : "—"
          }
        />
      </div>

      {top_items.length > 0 ? (
        <div>
          <SectionLabel>{messages.settings.posSessions.topItems}</SectionLabel>
          <ItemGroup>
            {top_items.map((item) => (
              <Item key={`${item.source}-${item.name}`} variant="outline">
                <ItemContent>
                  <ItemTitle>{item.name}</ItemTitle>
                  <ItemDescription>
                    {ITEM_SOURCE_LABEL[item.source]} · {item.qty}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <Badge variant="outline">
                    {ITEM_SOURCE_LABEL[item.source]}
                  </Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatVND(item.revenue)}
                  </span>
                </ItemFooter>
              </Item>
            ))}
          </ItemGroup>
        </div>
      ) : (
        <NoteCallout label={messages.settings.posSessions.topItemsEmptyTitle}>
          {messages.settings.posSessions.topItemsEmptyDescription}
        </NoteCallout>
      )}

      {category_breakdown.length > 0 ? (
        <div>
          <SectionLabel>
            {messages.settings.posSessions.revenueByCategory}
          </SectionLabel>
          <div className="flex flex-col gap-2">
            {category_breakdown.map((cat) => (
              <div
                key={`${cat.category_id}-${cat.category_name}`}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{cat.category_name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {messages.settings.posSessions.categoryLine(
                      cat.qty,
                      formatVND(cat.revenue),
                    )}
                  </span>
                </div>
                <Progress
                  value={(cat.revenue / maxCategoryRevenue) * 100}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {aov_bins.length > 0 ? (
        <div>
          <SectionLabel>
            {messages.settings.posSessions.billValueDistribution}
          </SectionLabel>
          <div className="flex flex-col gap-2">
            {aov_bins.map((bin) => (
              <div key={bin.label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{bin.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {messages.settings.posSessions.billCount(bin.count)}
                  </span>
                </div>
                <Progress
                  value={(bin.count / maxBinCount) * 100}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {discounts.count > 0 ? (
        <div>
          <SectionLabel>
            {messages.settings.posSessions.discountSection(
              discounts.count,
              formatVND(discounts.total),
            )}
          </SectionLabel>
          <ItemGroup>
            {discounts.top_orders.map((order) => (
              <Item key={order.order_id} variant="outline">
                <ItemContent>
                  <ItemTitle>{order.order_number}</ItemTitle>
                  <ItemDescription>{order.note ?? "—"}</ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <Badge variant="outline">
                    {order.type === "pct"
                      ? formatPercent(order.value ?? 0)
                      : order.type === "vnd"
                        ? "VND"
                        : "—"}
                  </Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums text-destructive">
                    -{formatVND(order.amount)}
                  </span>
                </ItemFooter>
              </Item>
            ))}
          </ItemGroup>
        </div>
      ) : null}
    </AppSection>
  );
}

function DetailFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <Item variant="muted" size="xs" className="items-start">
      <ItemContent>
        <ItemTitle className="text-xs text-muted-foreground">{label}</ItemTitle>
        <div className={cn("font-medium", mono && "font-mono tabular-nums")}>
          {value}
        </div>
      </ItemContent>
    </Item>
  );
}

function AddOnLine({
  label,
  name,
  amount,
}: {
  label: string;
  name: string;
  amount: number;
}) {
  return (
    <div className="flex gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1">{name}</span>
      {amount > 0 ? (
        <span className="shrink-0 font-mono tabular-nums">
          +{formatVND(amount)}
        </span>
      ) : null}
    </div>
  );
}

function OrderDetailDrawer({
  order,
  canCorrectPaymentMethod,
  open,
  onOpenChange,
}: {
  order: PosSessionOrder | null;
  canCorrectPaymentMethod: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [methodFixReason, setMethodFixReason] = useState("");
  const [methodFixOpen, setMethodFixOpen] = useState(false);
  const [isMethodFixPending, startMethodFix] = useTransition();
  const targetMethod = order?.payment_method === "cash" ? "vietqr" : "cash";
  const canOfferMethodFix =
    canCorrectPaymentMethod &&
    order?.payment_status === "paid" &&
    (order.payment_method === "cash" || order.payment_method === "vietqr");
  const trimmedMethodFixReason = methodFixReason.trim();

  function handleMethodFix() {
    if (!order || trimmedMethodFixReason.length < 5) return;
    startMethodFix(async () => {
      const result = await correctPaymentMethod({
        orderId: order.id,
        newMethod: targetMethod,
        reason: trimmedMethodFixReason,
      });
      if (!result.success) {
        toast.error(
          result.error ?? messages.finance.invoiceList.methodFixFailed,
        );
        return;
      }
      toast.success(messages.finance.invoiceList.methodFixSuccess);
      setMethodFixOpen(false);
      setMethodFixReason("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex flex-col overflow-hidden">
          <DrawerHeader>
            <div className="flex flex-col gap-1">
              <DrawerTitle className="text-base font-semibold">
                {order?.order_number ?? ""}
              </DrawerTitle>
              {order ? (
                <DrawerDescription>
                  {order.order_type === "dine_in"
                    ? messages.settings.posSessions.tableContext(
                        order.tables?.number ?? "-",
                      )
                    : messages.settings.posSessions.takeaway}
                  {" · "}
                  {formatDateTime(order.created_at)}
                </DrawerDescription>
              ) : null}
            </div>
          </DrawerHeader>

          <ScrollArea className="min-h-0 flex-1">
            {order ? (
              <div className="flex flex-col gap-4">
                <div className="grid gap-2 lg:grid-cols-2">
                  <DetailFact
                    label={messages.settings.posSessions.orderNumber}
                    value={order.order_number}
                    mono
                  />
                  <DetailFact
                    label={messages.settings.posSessions.orderContext}
                    value={
                      order.order_type === "dine_in"
                        ? messages.settings.posSessions.tableContext(
                            order.tables?.number ?? "-",
                          )
                        : messages.settings.posSessions.takeaway
                    }
                  />
                  <DetailFact
                    label={messages.settings.posSessions.orderCreatedAt}
                    value={formatDateTime(order.created_at)}
                    mono
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    domain="order"
                    value={order.status}
                    label={`${messages.settings.posSessions.orderStatus}: ${
                      getStatusBadgeMeta("order", order.status).label
                    }`}
                  />
                  <Badge
                    variant={
                      order.payment_status === "paid" ? "secondary" : "outline"
                    }
                  >
                    {messages.settings.posSessions.payment}:{" "}
                    {order.payment_status === "paid"
                      ? messages.settings.posSessions.paidWithMethod(
                          paymentMethodLabel(order.payment_method),
                        )
                      : messages.settings.posSessions.unpaid}
                  </Badge>
                  {canOfferMethodFix ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMethodFixOpen(true)}
                    >
                      {messages.finance.invoiceList.methodFix}:{" "}
                      {paymentMethodLabel(targetMethod)}
                    </Button>
                  ) : null}
                </div>

                <div>
                  <SectionLabel>
                    {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: branch home uses vietnamese */}
                    <span>Món ăn</span>
                  </SectionLabel>
                  <BranchOperatorFrame className="mt-2 divide-y">
                    {order.order_items.map((item) => {
                      const hasAddOns =
                        item.modifiers.length > 0 || item.sides.length > 0;
                      const modifierUnit = item.modifiers.reduce(
                        (sum, modifier) => sum + modifier.price,
                        0,
                      );
                      const sideUnit = item.sides.reduce(
                        (sum, side) => sum + side.price * side.quantity,
                        0,
                      );
                      const baseUnit = Math.max(
                        0,
                        item.unit_price - modifierUnit - sideUnit,
                      );

                      return (
                        <div key={item.id} className="flex gap-3 px-3 py-2">
                          <span className="w-10 shrink-0 font-medium tabular-nums">
                            {messages.settings.posSessions.quantityPrefix(
                              item.quantity,
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">
                              {item.item_name}
                              {item.variant_name ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({item.variant_name})
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {messages.settings.posSessions.linePrice(
                                formatVND(
                                  hasAddOns ? baseUnit : item.unit_price,
                                ),
                                item.quantity,
                              )}
                              {item.status === "cancelled" ? (
                                <span className="ml-2 text-destructive">
                                  {messages.settings.posSessions.cancelledItem}
                                </span>
                              ) : null}
                            </div>
                            {hasAddOns ? (
                              <div className="mt-1 flex flex-col gap-1">
                                {item.modifiers.map((modifier) => (
                                  <AddOnLine
                                    key={`modifier-${String(modifier.modifier_id)}`}
                                    label={
                                      messages.settings.posSessions.modifier
                                    }
                                    name={modifier.name}
                                    amount={modifier.price * item.quantity}
                                  />
                                ))}
                                {item.sides.map((side) => {
                                  const totalQuantity =
                                    side.quantity * item.quantity;
                                  const name =
                                    totalQuantity > 1
                                      ? `${side.name} ×${String(totalQuantity)}`
                                      : side.name;

                                  return (
                                    <AddOnLine
                                      key={`side-${String(side.side_item_id)}`}
                                      label={messages.settings.posSessions.side}
                                      name={name}
                                      amount={side.price * totalQuantity}
                                    />
                                  );
                                })}
                              </div>
                            ) : null}
                            {item.note ? (
                              <div className="mt-1 text-xs italic text-muted-foreground">
                                {messages.settings.posSessions.itemNote}:{" "}
                                {item.note}
                              </div>
                            ) : null}
                          </div>
                          <span
                            className={cn(
                              "text-sm font-medium tabular-nums",
                              item.status === "cancelled" &&
                                "text-muted-foreground line-through",
                            )}
                          >
                            {formatVND(item.subtotal)}
                          </span>
                        </div>
                      );
                    })}
                  </BranchOperatorFrame>
                </div>

                <BranchOperatorFrame className="flex flex-col gap-1.5 px-3 py-2 text-sm">
                  <KVRow
                    label={messages.settings.posSessions.subtotal}
                    value={formatVND(order.subtotal)}
                  />
                  {order.discount_amount > 0 ? (
                    <KVRow
                      label={messages.settings.posSessions.discount}
                      value={`-${formatVND(order.discount_amount)}`}
                      tone="success"
                    />
                  ) : null}
                  {order.service_charge > 0 ? (
                    <KVRow
                      label={messages.settings.posSessions.serviceCharge}
                      value={formatVND(order.service_charge)}
                    />
                  ) : null}
                  {order.tax_amount > 0 ? (
                    <KVRow
                      label={messages.settings.posSessions.tax}
                      value={formatVND(order.tax_amount)}
                    />
                  ) : null}
                  <Separator />
                  <KVRow
                    label={messages.settings.posSessions.total}
                    value={formatVND(order.total_amount)}
                    bold
                  />
                </BranchOperatorFrame>

                {order.note ? (
                  <NoteCallout label={messages.settings.posSessions.billNote}>
                    {order.note}
                  </NoteCallout>
                ) : null}
              </div>
            ) : null}
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      <ReasonConfirmDialog
        open={methodFixOpen}
        onOpenChange={(next) => {
          setMethodFixOpen(next);
          if (!next) setMethodFixReason("");
        }}
        title={messages.finance.invoiceList.methodFixDialogTitle}
        description={messages.finance.invoiceList.methodFixWarning}
        reasonId={`pos-order-method-fix-${String(order?.id ?? "none")}`}
        reason={methodFixReason}
        onReasonChange={setMethodFixReason}
        reasonLabel={messages.finance.invoiceList.methodFixReasonLabel(5)}
        reasonPlaceholder={
          messages.finance.invoiceList.methodFixReasonPlaceholder
        }
        reasonMinLength={5}
        reasonTextareaProps={{
          rows: 3,
          maxLength: 500,
          disabled: isMethodFixPending,
        }}
        cancelLabel={messages.finance.invoiceList.methodFixCancel}
        cancelDisabled={isMethodFixPending}
        confirmLabel={messages.finance.invoiceList.methodFixConfirm}
        canConfirm={trimmedMethodFixReason.length >= 5}
        isPending={isMethodFixPending}
        onConfirm={handleMethodFix}
      />
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "muted" | "success" | "warning" | "destructive";
}) {
  return (
    <Item variant="muted" className="items-start">
      <ItemContent>
        <ItemTitle className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </ItemTitle>
        <div
          className={cn(
            "mt-2 text-lg font-semibold tabular-nums",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </div>
      </ItemContent>
    </Item>
  );
}

function CashLine({ label, value }: { label: string; value: number | null }) {
  return (
    <Item variant="outline" size="xs" className="items-start">
      <ItemContent>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 font-medium tabular-nums">
          {value == null
            ? messages.settings.posSessions.noValue
            : formatVND(value)}
        </div>
      </ItemContent>
    </Item>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <Item variant="outline" size="xs" className="justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </Item>
  );
}

function KVRow({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "success" | "destructive";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", bold && "text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          bold && "text-base font-semibold",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function buildSummary(orders: PosSessionOrder[]): SessionSummary {
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const paid = activeOrders.filter((o) => o.payment_status === "paid");
  const completedPayments = paid.flatMap((order) =>
    order.payments.filter((payment) => payment.status === "completed"),
  );
  const breakdownMap = new Map<string, { count: number; amount: number }>();
  let cashRevenue = 0;
  let noncashRevenue = 0;
  for (const payment of completedPayments) {
    const method = payment.method || "unknown";
    const entry = breakdownMap.get(method) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += payment.amount;
    breakdownMap.set(method, entry);
    if (method === "cash") cashRevenue += payment.amount;
    else noncashRevenue += payment.amount;
  }
  const paymentBreakdown = Array.from(breakdownMap.entries())
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    billCount: activeOrders.length,
    revenue: completedPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    ),
    servedItems: activeOrders.reduce((sum, o) => sum + countItems(o), 0),
    cashRevenue,
    noncashRevenue,
    paidCount: paid.length,
    unpaidCount: activeOrders.length - paid.length,
    cancelledCount: orders.length - activeOrders.length,
    paymentBreakdown,
  };
}

function countItems(order: PosSessionOrder): number {
  return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
}

function formatDateTime(value: string | null): string {
  return formatVNDateTime(value, "-");
}

function formatTime(value: string): string {
  return formatVNTime(value, "-");
}

function formatDuration(start: string, end: string | null): string {
  return formatVNDuration(start, end);
}
