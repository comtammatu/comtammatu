"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock as IconClock,
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
import { formatCount, formatVND } from "@comtammatu/shared/format";
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
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import type { CartModifier, CartSide } from "../../pos/types";
import { resolvePosSessionVariance } from "./actions";
import { isPosSessionVarianceBreached } from "./_lib/normalize";
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
}

interface PosSessionsListClientProps {
  branchId: number;
  sessions: PosSessionRow[];
  view: "current" | "history";
  page: number;
  hasNextPage: boolean;
}

interface PosSessionDetailClientProps {
  branchId: number;
  session: PosSessionRow;
  orders: PosSessionOrder[];
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

function isVarianceResolved(session: PosSessionRow): boolean {
  return Boolean(session.variance_approval_note);
}

export function PosSessionsListClient({
  branchId,
  sessions,
  view,
  page,
  hasNextPage,
}: PosSessionsListClientProps) {
  const openSessionCount = sessions.filter(
    (session) => session.status === "open",
  ).length;
  const unresolvedVarianceCount = sessions.filter(
    (session) =>
      isPosSessionVarianceBreached(session) &&
      session.status !== "open" &&
      !isVarianceResolved(session),
  ).length;

  return (
    <SessionHistoryPanel
      branchId={branchId}
      sessions={sessions}
      openSessionCount={openSessionCount}
      unresolvedVarianceCount={unresolvedVarianceCount}
      view={view}
      page={page}
      hasNextPage={hasNextPage}
    />
  );
}

export function PosSessionDetailClient({
  branchId,
  session,
  orders,
}: PosSessionDetailClientProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const summary = useMemo(() => buildSummary(orders), [orders]);

  return (
    <>
      <SessionDetailCard
        branchId={branchId}
        session={session}
        summary={summary}
      />

      <AppSection
        title={messages.settings.posSessions.billsInSession(orders.length)}
        description={messages.settings.posSessions.billsDescription}
        contentFlush
        contentScroll
      >
        {orders.length > 0 ? (
          <ItemGroup>
            {orders.map((order) => (
              <Item
                key={order.id}
                asChild
                variant="outline"
                className="chrome-tap text-left active:bg-muted/50"
              >
                <button
                  type="button"
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
                </button>
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

      <OrderDetailDrawer
        order={selectedOrder}
        open={selectedOrder !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedOrderId(null);
        }}
      />
    </>
  );
}

function SessionHistoryPanel({
  branchId,
  sessions,
  openSessionCount,
  unresolvedVarianceCount,
  view,
  page,
  hasNextPage,
}: {
  branchId: number;
  sessions: PosSessionRow[];
  openSessionCount: number;
  unresolvedVarianceCount: number;
  view: "current" | "history";
  page: number;
  hasNextPage: boolean;
}) {
  const baseHref = `/br/${branchId}/pos-sessions`;

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={view}>
        <TabsList className="grid min-h-12 w-full grid-cols-2">
          <TabsTrigger value="current" asChild>
            <Link href={baseHref}>
              {messages.settings.posSessions.currentWork}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="history" asChild>
            <Link href={`${baseHref}?view=history`}>
              {messages.settings.posSessions.sessionHistory}
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {sessions.length > 0 ? (
        <AppSection
          title={
            view === "current"
              ? messages.settings.posSessions.currentWork
              : messages.settings.posSessions.sessionHistory
          }
          description={
            view === "current"
              ? messages.settings.posSessions.sessionHistoryDescription(
                  openSessionCount,
                  unresolvedVarianceCount,
                )
              : messages.settings.posSessions.historyPage(page)
          }
          badge={{
            children: messages.settings.posSessions.sessionCount(
              sessions.length,
            ),
            variant: "secondary",
          }}
          className="h-fit"
          contentClassName="gap-2"
        >
          <ItemGroup>
            {sessions.map((session) => {
              const breached = isPosSessionVarianceBreached(session);
              const resolved = breached && isVarianceResolved(session);
              return (
                <Button
                  asChild
                  key={session.id}
                  variant="ghost"
                  size="touch-lg"
                  className="w-full justify-start text-left"
                >
                  <Link
                    href={`/br/${branchId}/pos-sessions/${session.id}`}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-3"
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
                            ? messages.settings.posSessions
                                .varianceResolvedShort
                            : messages.settings.posSessions.varianceShort}
                        </Badge>
                      ) : null}
                      <Badge
                        variant={
                          session.status === "open" ? "warning" : "outline"
                        }
                      >
                        {session.status === "open"
                          ? messages.settings.posSessions.open
                          : messages.settings.posSessions.closed}
                      </Badge>
                    </span>
                  </Link>
                </Button>
              );
            })}
          </ItemGroup>
        </AppSection>
      ) : (
        <AppEmptyState
          title={
            view === "current"
              ? messages.settings.posSessions.noCurrentWork
              : messages.settings.posSessions.emptyTitle
          }
          description={
            view === "current"
              ? messages.settings.posSessions.noCurrentWorkDescription
              : messages.settings.posSessions.emptyDescription
          }
          symbol="roof"
        />
      )}

      {view === "history" && (page > 1 || hasNextPage) ? (
        <nav
          aria-label={messages.settings.posSessions.historyPagination}
          className="flex items-center justify-between gap-2"
        >
          {page > 1 ? (
            <Button asChild variant="outline" size="touch">
              <Link href={`${baseHref}?view=history&page=${String(page - 1)}`}>
                {messages.settings.posSessions.previousPage}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {hasNextPage ? (
            <Button asChild variant="outline" size="touch">
              <Link href={`${baseHref}?view=history&page=${String(page + 1)}`}>
                {messages.settings.posSessions.nextPage}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

interface SessionSummary {
  billCount: number;
  revenue: number;
  paidCount: number;
  unpaidCount: number;
  cancelledCount: number;
  paymentBreakdown: Array<{ method: string; count: number; amount: number }>;
}

function SessionDetailCard({
  branchId,
  session,
  summary,
}: {
  branchId: number;
  session: PosSessionRow;
  summary: SessionSummary;
}) {
  const router = useRouter();
  const breached = isPosSessionVarianceBreached(session);
  const resolved = breached && isVarianceResolved(session);
  const threshold = computeVarianceThreshold(session.expected_cash);
  const isOpen = session.status === "open";
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolving, startResolving] = useTransition();
  const trimmedResolutionNote = resolutionNote.trim();
  const canResolve =
    breached &&
    !isOpen &&
    !resolved &&
    trimmedResolutionNote.length >= 10 &&
    trimmedResolutionNote.length <= 500 &&
    !isResolving;

  function handleResolveVariance() {
    if (!canResolve) return;

    startResolving(async () => {
      const result = await resolvePosSessionVariance(
        branchId,
        session.id,
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
      router.refresh();
    });
  }

  return (
    <AppSection
      title={resolveSessionLabel(session)}
      description={
        <div className="flex flex-col gap-1">
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
    >
      {!isOpen && breached ? (
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

      {isOpen ? (
        <ItemGroup className="grid grid-cols-2 gap-2">
          <KV
            label={messages.settings.posSessions.totalBills}
            value={formatCount(summary.billCount)}
          />
          <KV
            label={messages.settings.posSessions.paidRevenue}
            value={formatVND(summary.revenue)}
          />
          <KV
            label={messages.settings.posSessions.paidOrders}
            value={formatCount(summary.paidCount)}
          />
          <KV
            label={messages.settings.posSessions.unpaidOrders}
            value={formatCount(summary.unpaidCount)}
          />
        </ItemGroup>
      ) : (
        <ItemGroup className="grid grid-cols-2 gap-2">
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
          <CashLine
            label={messages.settings.posSessions.cashVariance}
            value={session.cash_difference}
          />
        </ItemGroup>
      )}

      <Separator />

      {!isOpen ? (
        <ItemGroup className="grid grid-cols-2 gap-2">
          <KV
            label={messages.settings.posSessions.paidOrders}
            value={formatCount(summary.paidCount)}
          />
          <KV
            label={messages.settings.posSessions.unpaidOrders}
            value={formatCount(summary.unpaidCount)}
          />
        </ItemGroup>
      ) : null}

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
                <span className="font-mono font-medium tabular-nums">
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
  open,
  onOpenChange,
}: {
  order: PosSessionOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
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
              </div>

              <div>
                <SectionLabel>
                  {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: operator hub uses vietnamese */}
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
                            <div className="mt-1 flex flex-col gap-1">
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
  );
}

function CashLine({ label, value }: { label: string; value: number | null }) {
  return (
    <Item variant="outline" size="xs" className="items-start">
      <ItemContent>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 font-mono font-medium tabular-nums">
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
      <span className="font-mono font-medium tabular-nums">{value}</span>
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
  for (const order of paid) {
    const method = order.payment_method ?? "unknown";
    const entry = breakdownMap.get(method) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += order.total_amount;
    breakdownMap.set(method, entry);
  }
  const paymentBreakdown = Array.from(breakdownMap.entries())
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    billCount: activeOrders.length,
    revenue: paid.reduce((sum, o) => sum + o.total_amount, 0),
    paidCount: paid.length,
    unpaidCount: activeOrders.length - paid.length,
    cancelledCount: orders.length - activeOrders.length,
    paymentBreakdown,
  };
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
