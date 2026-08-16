"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  AppEmptyState,
  StationSheet,
} from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Item, ItemFooter, ItemGroup } from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";


import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  Printer as IconPrinter,
  QrCode as IconQrcode,
  Receipt as IconReceipt,
  RefreshCw as IconRefresh,
  Search as IconSearch,
} from "lucide-react";
import { PAYMENT_METHOD_LABELS_VI } from "@comtammatu/shared/labels";
import { OrderCardSummary, type SessionOrder } from "../order-history";
import { getPosCompletedOrderStatusInfo } from "../_lib/order-status-display";
import {
  canConvertPosCashToVietQr,
  canPrintPosVietQrPayment,
} from "../_lib/cash-to-vietqr";
import {
  confirmConvertCashToVietQr,
  convertCashToVietQrAndPrint,
  printPaidVietQr,
} from "../_lib/cash-to-vietqr-flow";
import {
  useArchivedOrders,
  type ArchivedScope,
} from "../_hooks/use-archived-orders";

import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
interface ArchivedOrdersSheetProps {
  branchId: number;
  sessionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewBill: (orderId: number, intent: "receipt") => void;
  canConfirmCash: boolean;
  vietQrEnabled: boolean;
}

export function ArchivedOrdersSheet({
  branchId,
  sessionId,
  open,
  onOpenChange,
  onViewBill,
  canConfirmCash,
  vietQrEnabled,
}: ArchivedOrdersSheetProps) {
  const isMobile = useIsMobile(1280);
  const [scope, setScope] = useState<ArchivedScope>("session");
  // Debounced search — Zod tolerates max 80, but we throttle keystrokes so a
  // long search string doesn't fire one query per character.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setDebouncedQuery(searchInput), 250);
    return () => window.clearTimeout(id);
  }, [open, searchInput]);

  // Reset filters when the sheet closes so the next open starts clean.
  // Keep the search box value to make "close + reopen for one more lookup"
  // ergonomic — only the active query is reset.
  useEffect(() => {
    if (open) return;
    setDebouncedQuery("");
    setSearchInput("");
    setScope("session");
  }, [open]);

  const { orders, isLoading, isLoadingMore, hasMore, error, reload, loadMore } =
    useArchivedOrders({
      branchId,
      sessionId,
      open,
      scope,
      query: debouncedQuery,
    });
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [, startAction] = useTransition();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting === true) {
          loadMore();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, loadMore]);

  const handleConvert = (order: SessionOrder) => {
    // Confirm must stay outside useTransition. ConfirmDialogProvider setState
    // in the same transition as printPending never paints, so the button
    // spins and the dialog never appears.
    void (async () => {
      const confirmed = await confirmConvertCashToVietQr({
        orderNumber: order.order_number,
        amount: Number(order.total_amount),
      });
      if (!confirmed) return;
      startAction(async () => {
        setPendingOrderId(order.id);
        try {
          const result = await convertCashToVietQrAndPrint(branchId, order.id);
          if (result.type === "success") toast.success(result.message);
          else if (result.type === "warning") toast.warning(result.message);
          else toast.error(result.message);
        } finally {
          setPendingOrderId(null);
          reload();
        }
      });
    })();
  };

  const handlePrintVietQr = (order: SessionOrder) => {
    startAction(async () => {
      setPendingOrderId(order.id);
      const result = await printPaidVietQr(order.id);
      setPendingOrderId(null);
      if (result.type === "success") toast.success(result.message);
      else if (result.type === "warning") toast.warning(result.message);
      else toast.error(result.message);
    });
  };

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 px-4 py-3 flex flex-col gap-3">
        <InputGroup size="touch">
          <InputGroupAddon>
            <IconSearch aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            inputMode="search"
            placeholder={messages.pos.archivedOrders.searchPlaceholder}
            className="text-base"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={messages.pos.archivedOrders.searchAria}
            data-testid="pos-archived-search"
          />
        </InputGroup>
        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(value) => {
            if (value === "session" || value === "today") setScope(value);
          }}
          variant="outline"
          size="touch"
          className="grid w-full grid-cols-2 gap-1"
        >
          <ToggleGroupItem
            value="session"
            className="justify-center font-semibold"
          >
            {messages.pos.archivedOrders.currentSession}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="today"
            className="justify-center font-semibold"
          >
            {messages.pos.archivedOrders.branchToday}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 px-3 py-3">
          {error !== null ? (
            <AppEmptyState
              title={messages.pos.archivedOrders.loadFailed}
              description={error}
              className="min-h-32"
              compact
            >
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="mt-2"
                onClick={reload}
              >
                <IconRefresh data-icon="inline-start" />
                {ACTIONS_VI.retry}
              </Button>
            </AppEmptyState>
          ) : isLoading ? (
            <AppEmptyState
              title={STATES_VI.loading}
              icon={<Spinner />}
              className="min-h-32"
              compact
            />
          ) : orders.length === 0 ? (
            <AppEmptyState
              title={
                debouncedQuery !== ""
                  ? messages.pos.archivedOrders.emptyMatch(debouncedQuery)
                  : messages.pos.archivedOrders.empty
              }
              icon={<IconReceipt />}
              className="min-h-32"
              compact
            />
          ) : (
            <ItemGroup className="gap-2">
              {orders.map((order) => (
                <ArchivedOrderRow
                  key={order.id}
                  order={order}
                  pending={pendingOrderId === order.id}
                  canConvert={canConvertPosCashToVietQr({
                    status: order.status,
                    paymentStatus: order.payment_status,
                    paymentMethod: order.payment_method,
                    canConfirmCash,
                    vietQrEnabled,
                  })}
                  canPrintVietQr={canPrintPosVietQrPayment({
                    status: order.status,
                    paymentStatus: order.payment_status,
                    paymentMethod: order.payment_method,
                  })}
                  onViewBill={onViewBill}
                  onConvert={() => handleConvert(order)}
                  onPrintVietQr={() => handlePrintVietQr(order)}
                />
              ))}
            </ItemGroup>
          )}

          {/* Sentinel for IntersectionObserver-driven pagination. Always
              present so the observer instance survives content swaps; it
              just sits below the list and triggers `loadMore` when scrolled
              into view. */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />

          {isLoadingMore ? (
            <div className="flex items-center justify-center py-3 text-sm text-muted-foreground">
              <Spinner data-icon="inline-start" />
              {messages.pos.archivedOrders.loadingMore}
            </div>
          ) : !hasMore && orders.length > 0 ? (
            <div className="py-3 text-center text-sm text-muted-foreground">
              {messages.pos.archivedOrders.end}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <StationSheet
      side={isMobile ? "bottom" : "right"}
      size="md"
      fullscreen={isMobile}
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          {messages.pos.archivedOrders.sheetTitle}
          {orders.length > 0 ? (
            <Badge variant="secondary" className="text-xs">
              {orders.length}
              {hasMore ? "+" : ""}
            </Badge>
          ) : null}
        </span>
      }
      description={messages.pos.archivedOrders.description}
      bodyClassName="p-0"
    >
      {body}
    </StationSheet>
  );
}

function CompletedOrderStatePill({ order }: { order: SessionOrder }) {
  const statusInfo = getPosCompletedOrderStatusInfo(order);
  const methodLabel =
    order.status !== "cancelled" &&
    (order.payment_method === "cash" || order.payment_method === "vietqr")
      ? PAYMENT_METHOD_LABELS_VI[order.payment_method]
      : null;

  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {methodLabel ? (
        <Badge variant="outline" className="text-sm font-semibold">
          {methodLabel}
        </Badge>
      ) : null}
      <Badge
        variant={statusInfo.variant}
        className={
          statusInfo.variant === "outline"
            ? "bg-background text-sm font-semibold tabular-nums"
            : "text-sm font-semibold tabular-nums"
        }
      >
        {statusInfo.label}
      </Badge>
    </span>
  );
}

function ArchivedOrderRow({
  order,
  pending,
  canConvert,
  canPrintVietQr,
  onViewBill,
  onConvert,
  onPrintVietQr,
}: {
  order: SessionOrder;
  pending: boolean;
  canConvert: boolean;
  canPrintVietQr: boolean;
  onViewBill: (orderId: number, intent: "receipt") => void;
  onConvert: () => void;
  onPrintVietQr: () => void;
}) {
  const hasMoneyAction = canConvert || canPrintVietQr;

  return (
    <Item
      data-testid={`pos-archived-bill-${order.id}`}
      variant="outline"
      size="sm"
      role="listitem"
      className="bg-card"
    >
      <OrderCardSummary
        order={order}
        metaTimestamp={order.updated_at}
        amountClassName="text-foreground"
        rightMeta={<CompletedOrderStatePill order={order} />}
      />
      <ItemFooter
        className={
          hasMoneyAction
            ? "mt-2 grid w-full grid-cols-2 gap-2 border-t border-border/60 pt-2"
            : "mt-2 justify-end border-t border-border/60 pt-2"
        }
      >
        {canConvert ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full min-w-0"
            disabled={pending}
            data-testid={`pos-archived-convert-vietqr-${order.id}`}
            aria-label={messages.pos.archivedOrders.convertCashToVietQrAria(
              order.order_number,
            )}
            onClick={onConvert}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconQrcode data-icon="inline-start" />
            )}
            {messages.pos.archivedOrders.convertCashToVietQr}
          </Button>
        ) : null}
        {canPrintVietQr ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full min-w-0"
            disabled={pending}
            data-testid={`pos-archived-print-vietqr-${order.id}`}
            aria-label={messages.pos.archivedOrders.printVietQrAria(
              order.order_number,
            )}
            onClick={onPrintVietQr}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconPrinter data-icon="inline-start" />
            )}
            {messages.pos.archivedOrders.printVietQr}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="touch"
          className={hasMoneyAction ? "w-full min-w-0" : undefined}
          disabled={pending}
          aria-label={messages.pos.archivedOrders.openReceiptAria(
            order.order_number,
          )}
          onClick={() => onViewBill(order.id, "receipt")}
        >
          <IconReceipt data-icon="inline-start" />
          {messages.pos.archivedOrders.viewReceipt}
        </Button>
      </ItemFooter>
    </Item>
  );
}
