"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
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
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { formatVND } from "@comtammatu/shared/format";
import { getPaymentMethodLabelVi } from "@comtammatu/shared/labels";
import {
  StatusBadge,
  getStatusBadgeMeta,
} from "@/components/status-badge";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  Item,
  ItemContent,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { CloseSessionSheet } from "../../pos/close-session-sheet";
import type { CartModifier, CartSide } from "../../pos/types";
import type { PosSessionReport } from "./report-actions";
import { messages } from "@lib/messages";

import { FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
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
  pos_terminals: { name: string } | null;
  opened_by_profile: { full_name: string } | null;
  closed_by_profile: { full_name: string } | null;
}

/** Resolve display name của ca: ưu tiên tên terminal nếu còn, fallback
 * "Ca chung của chi nhánh" cho ca không liên kết terminal (post-D7). */
function resolveSessionLabel(session: PosSessionRow): string {
  if (session.pos_terminals?.name) return session.pos_terminals.name;
  if (session.terminal_id != null) return `POS #${String(session.terminal_id)}`;
  return messages.settings.posSessions.branchSharedSession;
}

export interface PosSessionOrderItem {
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
  customer_count: number;
  note: string | null;
  created_at: string;
  table_id: number | null;
  tables: { number: number } | null;
  order_items: PosSessionOrderItem[];
}

interface PosSessionsClientProps {
  branchId: number;
  sessions: PosSessionRow[];
  selectedSessionId: number | null;
  orders: PosSessionOrder[];
  report: PosSessionReport | null;
}

function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  return getPaymentMethodLabelVi(method);
}

/** Server tính: max(50.000đ, 0.5% × expected_cash). Mirror inline cho UI
 * khi server không trả về (sessions cũ trước D8 chỉ có cash_difference). */
function computeVarianceThreshold(expectedCash: number | null): number {
  if (expectedCash == null) return 50_000;
  return Math.max(50_000, Math.round(expectedCash * 0.005 * 100) / 100);
}

function isVarianceBreached(session: PosSessionRow): boolean {
  if (session.cash_difference == null) return false;
  const threshold = computeVarianceThreshold(session.expected_cash);
  return Math.abs(session.cash_difference) > threshold;
}

export function PosSessionsClient({
  branchId,
  sessions,
  selectedSessionId,
  orders,
  report,
}: PosSessionsClientProps) {
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;

  const summary = useMemo(() => buildSummary(orders), [orders]);

  if (sessions.length === 0) {
    return (
      <AppEmptyState
        title={messages.settings.posSessions.emptyTitle}
        description={messages.settings.posSessions.emptyDescription}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
      <AppSection
        title={messages.settings.posSessions.sessionHistory}
        className="h-fit"
        contentClassName="gap-2"
      >
        {sessions.map((session) => {
          const selected = session.id === selectedSessionId;
          const breached = isVarianceBreached(session);
          return (
            <Button
              asChild
              key={session.id}
              variant={selected ? "secondary" : "ghost"}
              className="h-auto w-full justify-start rounded-lg px-3 py-2"
            >
              <Link
                href={`/br/${branchId}/settings/pos-sessions?session=${session.id}`}
                className="flex min-w-0 items-center gap-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <IconClock className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold">
                    {resolveSessionLabel(session)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDateTime(session.opened_at)}
                  </span>
                </span>
                {breached ? (
                  <Badge variant="destructive">
                    {messages.settings.posSessions.varianceShort}
                  </Badge>
                ) : null}
                <Badge
                  variant={session.status === "open" ? "warning" : "outline"}
                >
                  {session.status === "open"
                    ? messages.settings.posSessions.open
                    : messages.settings.posSessions.closed}
                </Badge>
              </Link>
            </Button>
          );
        })}
      </AppSection>

      <div className="space-y-4">
        {selectedSession ? (
          <>
            <SessionDetailCard
              session={selectedSession}
              summary={summary}
              onCloseShift={() => setCloseSheetOpen(true)}
            />

            {report ? <SessionReportCard report={report} /> : null}

            <AppSection
              title={messages.settings.posSessions.billsInSession(
                orders.length,
              )}
              description={messages.settings.posSessions.billsDescription}
              contentScroll
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{messages.settings.posSessions.bill}</TableHead>
                    <TableHead>{messages.settings.posSessions.time}</TableHead>
                    <TableHead>{FORM_VI.status}</TableHead>
                    <TableHead>
                      {messages.settings.posSessions.payment}
                    </TableHead>
                    <TableHead className="text-right">
                      {FORM_VI.total}
                    </TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <TableCell className="max-w-sm">
                        <div className="font-medium">{order.order_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.order_type === "dine_in"
                            ? messages.settings.posSessions.tableContext(
                                order.tables?.number ?? "-",
                                order.customer_count,
                              )
                            : messages.settings.posSessions.takeaway}
                        </div>
                      </TableCell>
                      <TableCell>{formatTime(order.created_at)}</TableCell>
                      <TableCell>
                        <StatusBadge domain="order" value={order.status} />
                      </TableCell>
                      <TableCell>
                        {order.payment_status === "paid" ? (
                          <span className="text-success">
                            {paymentMethodLabel(order.payment_method)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {messages.settings.posSessions.unpaidShort}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium font-mono tabular-nums">
                        {formatVND(order.total_amount)}
                      </TableCell>
                      <TableCell>
                        <IconChevronRight className="size-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 ? (
                    <TableEmptyStateRow
                      colSpan={6}
                      title={messages.settings.posSessions.noBills}
                      paddingClassName="py-8"
                    />
                  ) : null}
                </TableBody>
              </Table>
            </AppSection>
          </>
        ) : null}
      </div>

      {selectedSession ? (
        <CloseSessionSheet
          sessionId={selectedSession.id}
          open={closeSheetOpen}
          onOpenChange={setCloseSheetOpen}
        />
      ) : null}

      <OrderDetailSheet
        order={selectedOrder}
        open={selectedOrder !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedOrderId(null);
        }}
      />
    </div>
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
  session,
  summary,
  onCloseShift,
}: {
  session: PosSessionRow;
  summary: SessionSummary;
  onCloseShift: () => void;
}) {
  const breached = isVarianceBreached(session);
  const threshold = computeVarianceThreshold(session.expected_cash);
  const isOpen = session.status === "open";

  return (
    <AppSection
      title={resolveSessionLabel(session)}
      description={
        <div className="space-y-1">
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
      action={
        isOpen ? (
          <Button onClick={onCloseShift}>
            {messages.settings.posSessions.closeShift}
          </Button>
        ) : (
          <Badge variant="outline" className="self-start">
            {messages.settings.posSessions.closed}
          </Badge>
        )
      }
      contentClassName="gap-4"
    >
      {breached ? (
        <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
          <IconAlertTriangle className="size-4" />
          <AlertDescription className="text-current">
            <strong>{messages.settings.posSessions.varianceAlertStrong}</strong>
            {messages.settings.posSessions.varianceAlert(
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<IconReceipt className="size-4" />}
          label={messages.settings.posSessions.totalBills}
          value={String(summary.billCount)}
        />
        <Metric
          icon={<IconCash className="size-4" />}
          label={messages.settings.posSessions.paidRevenue}
          value={formatVND(summary.revenue)}
        />
        <Metric
          icon={<IconToolsKitchen2 className="size-4" />}
          label={messages.settings.posSessions.servedItems}
          value={String(summary.servedItems)}
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

      <div className="grid gap-3 sm:grid-cols-3">
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

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
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
          value={String(summary.paidCount)}
        />
        <KV
          label={messages.settings.posSessions.unpaidOrders}
          value={String(summary.unpaidCount)}
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<IconReceipt className="size-4" />}
          label={messages.settings.posSessions.aov}
          value={formatVND(totals.aov)}
        />
        <Metric
          icon={<IconToolsKitchen2 className="size-4" />}
          label={messages.settings.posSessions.totalItems}
          value={String(totals.total_items)}
        />
        <Metric
          icon={<IconAlertTriangle className="size-4" />}
          label={messages.settings.posSessions.voidItems}
          value={String(totals.void_item_count)}
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
          <ScrollArea className="max-h-72">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {messages.settings.posSessions.itemName}
                  </TableHead>
                  <TableHead>
                    {messages.settings.posSessions.itemType}
                  </TableHead>
                  <TableHead className="text-right">
                    {messages.settings.posSessions.quantityShort}
                  </TableHead>
                  <TableHead className="text-right">
                    {messages.settings.posSessions.revenue}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top_items.map((item, idx) => (
                  <TableRow key={`${item.source}-${item.name}-${idx}`}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ITEM_SOURCE_LABEL[item.source]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {item.qty}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVND(item.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
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
          <div className="space-y-2">
            {category_breakdown.map((cat) => (
              <div
                key={`${cat.category_id}-${cat.category_name}`}
                className="space-y-1"
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
          <div className="space-y-2">
            {aov_bins.map((bin) => (
              <div key={bin.label} className="space-y-1">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages.settings.posSessions.bill}</TableHead>
                <TableHead>{messages.settings.posSessions.itemType}</TableHead>
                <TableHead className="text-right">
                  {messages.settings.posSessions.discount}
                </TableHead>
                <TableHead>{messages.settings.posSessions.note}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discounts.top_orders.map((order) => (
                <TableRow key={order.order_id}>
                  <TableCell className="font-medium">
                    {order.order_number}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {order.type === "pct"
                        ? `${order.value ?? 0}%`
                        : order.type === "vnd"
                          ? "VND"
                          : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    -{formatVND(order.amount)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {order.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </AppSection>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
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

function OrderDetailSheet({
  order,
  open,
  onOpenChange,
}: {
  order: PosSessionOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 data-[side=right]:w-full sm:max-w-lg"
      >
        <SheetHeader className="border-b px-4 pt-5 pb-3 text-left">
          <div className="space-y-1 pr-8">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {messages.settings.posSessions.orderSheetEyebrow}
            </div>
            <SheetTitle className="text-base font-semibold">
              {messages.settings.posSessions.orderSheetTitle(
                order?.order_number ?? "",
              )}
            </SheetTitle>
            {order ? (
              <SheetDescription>
                {order.order_type === "dine_in"
                  ? messages.settings.posSessions.tableContext(
                      order.tables?.number ?? "-",
                      0,
                    )
                  : messages.settings.posSessions.takeaway}
                {" · "}
                {formatDateTime(order.created_at)}
              </SheetDescription>
            ) : null}
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          {order ? (
            <div className="space-y-4 px-4 py-4">
              <div className="grid gap-2 sm:grid-cols-2">
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
                          0,
                        )
                      : messages.settings.posSessions.takeaway
                  }
                />
                <DetailFact
                  label={messages.settings.posSessions.orderCreatedAt}
                  value={formatDateTime(order.created_at)}
                  mono
                />
                <DetailFact
                  label={messages.settings.posSessions.customerCountLabel}
                  value={
                    order.customer_count > 0
                      ? messages.settings.posSessions.customerCount(
                          order.customer_count,
                        )
                      : messages.settings.posSessions.noValue
                  }
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
              </div>

              <div>
                <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {PRODUCT_VI.posItem}
                </h4>
                <div className="mt-2 divide-y rounded-lg border">
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
                              formatVND(hasAddOns ? baseUnit : item.unit_price),
                              item.quantity,
                            )}
                            {item.status === "cancelled" ? (
                              <span className="ml-2 text-destructive">
                                {messages.settings.posSessions.cancelledItem}
                              </span>
                            ) : null}
                          </div>
                          {hasAddOns ? (
                            <div className="mt-1 space-y-1">
                              {item.modifiers.map((modifier) => (
                                <AddOnLine
                                  key={`modifier-${String(modifier.modifier_id)}`}
                                  label={messages.settings.posSessions.modifier}
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
                </div>
              </div>

              <div className="rounded-lg border px-3 py-2 space-y-1.5 text-sm">
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
              </div>

              {order.note ? (
                <NoteCallout label={messages.settings.posSessions.billNote}>
                  {order.note}
                </NoteCallout>
              ) : null}
            </div>
          ) : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
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
  const breakdownMap = new Map<string, { count: number; amount: number }>();
  let cashRevenue = 0;
  let noncashRevenue = 0;
  for (const order of paid) {
    const method = order.payment_method ?? "unknown";
    const entry = breakdownMap.get(method) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += order.total_amount;
    breakdownMap.set(method, entry);
    if (method === "cash") cashRevenue += order.total_amount;
    else noncashRevenue += order.total_amount;
  }
  const paymentBreakdown = Array.from(breakdownMap.entries())
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    billCount: activeOrders.length,
    revenue: paid.reduce((sum, o) => sum + o.total_amount, 0),
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
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} phút`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}
