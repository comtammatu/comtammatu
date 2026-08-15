"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BellRing as IconBell,
  Check as IconCheck,
  X as IconX,
} from "lucide-react";
import {
  formatCount,
  formatPortionQuantity,
  formatSidePortionLabel,
  formatVND,
} from "@comtammatu/shared/format";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVNElapsedCompact, formatVNTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import {
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@comtammatu/ui/components/field";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  RadioGroup,
  RadioGroupItem,
} from "@comtammatu/ui/components/radio-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
  type SessionOrder,
} from "../order-history";
import { isActiveUnpaidPosOrder } from "../_lib/table-order-visual-state";
import {
  acceptSelfOrderRequest,
  rejectSelfOrderRequest,
  type SelfOrderPendingRequest,
  type SelfOrderPendingStaffCall,
  type SelfOrderStoredCartItem,
} from "../self-order-actions";
import { StationSheet } from "@/components/surface";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";

interface SelfOrderApprovalSheetProps {
  open: boolean;
  requests: SelfOrderPendingRequest[];
  staffCalls?: SelfOrderPendingStaffCall[];
  focusedRequestId: number | null;
  tableNumberById: ReadonlyMap<number, number>;
  orders: SessionOrder[];
  onOpenChange: (open: boolean) => void;
  onUpdated: () => Promise<void> | void;
  onAcknowledgeStaffCall?: (callId: number) => Promise<void> | void;
}

type TargetChoice = "" | "new" | `order:${number}`;

function itemOptionSummary(item: SelfOrderStoredCartItem) {
  return [
    ...item.modifiers.map((modifier) => modifier.name),
    ...item.sides.map((side) =>
      formatSidePortionLabel(side.name, side.quantity),
    ),
    item.note ? `${SELF_ORDER_VI.itemNoteLabel}: ${item.note}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function itemTotal(item: SelfOrderStoredCartItem) {
  const options =
    item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0) +
    item.sides.reduce((sum, side) => sum + side.price * side.quantity, 0);
  return (item.unit_price + options) * item.quantity;
}

export function SelfOrderApprovalSheet({
  open,
  requests,
  staffCalls = [],
  focusedRequestId,
  tableNumberById,
  orders,
  onOpenChange,
  onUpdated,
  onAcknowledgeStaffCall,
}: SelfOrderApprovalSheetProps) {
  const [targetByRequest, setTargetByRequest] = useState<
    Record<number, TargetChoice>
  >({});
  const [isPending, startTransition] = useTransition();
  const [ackingCallId, setAckingCallId] = useState<number | null>(null);

  const activeOrdersByTable = useMemo(() => {
    const byTable = new Map<number, SessionOrder[]>();
    for (const order of orders) {
      if (!isActiveUnpaidPosOrder(order, ACTIVE_POS_STATUSES)) continue;
      const tableId = order.table_id;
      if (tableId === null) continue;
      const tableOrders = byTable.get(tableId) ?? [];
      tableOrders.push(order);
      byTable.set(tableId, tableOrders);
    }
    for (const tableOrders of byTable.values()) {
      tableOrders.sort(compareOrdersByNextAction);
    }
    return byTable;
  }, [orders]);

  const displayedRequests = useMemo(() => {
    if (focusedRequestId === null) return requests;
    const focused = requests.find((request) => request.id === focusedRequestId);
    return focused
      ? [
          focused,
          ...requests.filter((request) => request.id !== focusedRequestId),
        ]
      : requests;
  }, [focusedRequestId, requests]);

  const totalPendingCount = requests.length + staffCalls.length;

  function approve(request: SelfOrderPendingRequest) {
    const activeOrders = activeOrdersByTable.get(request.tableId) ?? [];
    const targetChoice = targetByRequest[request.id] ?? "";
    if (activeOrders.length >= 2 && !targetChoice) {
      toast.error(SELF_ORDER_VI.staffTargetRequired);
      return;
    }
    const targetOrderId = targetChoice.startsWith("order:")
      ? Number(targetChoice.slice("order:".length))
      : null;

    startTransition(async () => {
      const result = await acceptSelfOrderRequest({
        requestId: request.id,
        targetOrderId,
      });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }
      toast.success(SELF_ORDER_VI.staffApproved);
      await onUpdated();
    });
  }

  async function reject(request: SelfOrderPendingRequest) {
    const confirmed = await confirm({
      title: SELF_ORDER_VI.staffRejectTitle,
      description: SELF_ORDER_VI.staffRejectDescription,
      confirmText: SELF_ORDER_VI.staffReject,
      cancelText: "Đóng",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await rejectSelfOrderRequest({ requestId: request.id });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }
      toast.success(SELF_ORDER_VI.staffRejected);
      await onUpdated();
    });
  }

  async function handleAcknowledgeCall(callId: number) {
    if (!onAcknowledgeStaffCall) return;
    setAckingCallId(callId);
    try {
      await onAcknowledgeStaffCall(callId);
    } finally {
      setAckingCallId(null);
    }
  }

  // Hotkey: Enter approves the top displayed request if valid
  useKeyboardShortcut(
    [
      {
        key: "Enter",
        handler: () => {
          if (open && displayedRequests.length > 0 && !isPending) {
            const topRequest = displayedRequests[0];
            if (topRequest) {
              const activeOrders =
                activeOrdersByTable.get(topRequest.tableId) ?? [];
              if (activeOrders.length < 2 || targetByRequest[topRequest.id]) {
                approve(topRequest);
              }
            }
          }
        },
      },
    ],
    open && displayedRequests.length > 0 && !isPending,
  );

  return (
    <StationSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2 text-base">
          {SELF_ORDER_VI.staffQueueTitle}
          {totalPendingCount > 0 ? (
            <Badge variant="warning">{formatCount(totalPendingCount)}</Badge>
          ) : null}
        </span>
      }
      description={
        <span className="sr-only">{SELF_ORDER_VI.staffQueueDescription}</span>
      }
      contentClassName="w-full sm:max-w-xl"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Staff Calls Section */}
        {staffCalls.length > 0 ? (
          <Frame className="gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-warning">
                <IconBell className="size-4" />
                {SELF_ORDER_VI.staffCallsTitle(staffCalls.length)}
              </span>
            </div>
            <ItemGroup className="gap-2">
              {staffCalls.map((call) => {
                const tableNumber = tableNumberById.get(call.tableId);
                const isAcking = ackingCallId === call.id;
                return (
                  <Item
                    key={call.id}
                    variant="outline"
                    size="sm"
                    className="items-center justify-between bg-card"
                  >
                    <ItemContent>
                      <ItemTitle className="text-sm font-semibold">
                        {tableNumber !== undefined
                          ? SELF_ORDER_VI.tableLabel(tableNumber)
                          : `Bàn #${call.tableId}`}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={isAcking || isPending}
                        onClick={() => void handleAcknowledgeCall(call.id)}
                        className="h-8 gap-1 text-xs"
                      >
                        {isAcking ? (
                          <Spinner className="size-3" />
                        ) : (
                          <IconCheck className="size-3" />
                        )}
                        {SELF_ORDER_VI.staffCallServed}
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </Frame>
        ) : null}

        {/* Requests List */}
        {displayedRequests.length === 0 && staffCalls.length === 0 ? (
          <Item variant="outline" className="border-dashed">
            <ItemDescription>{SELF_ORDER_VI.staffQueueEmpty}</ItemDescription>
          </Item>
        ) : (
          <ItemGroup role="list" className="gap-3">
            {displayedRequests.map((request) => {
              const activeOrders =
                activeOrdersByTable.get(request.tableId) ?? [];
              const needsDestination = activeOrders.length >= 2;
              const hasSingleOrder = activeOrders.length === 1;
              const isNewSeating = activeOrders.length === 0;
              const targetChoice = targetByRequest[request.id] ?? "";
              const provisionalTotal = request.items.reduce(
                (sum, item) => sum + itemTotal(item),
                0,
              );
              const tableNumber = tableNumberById.get(request.tableId);
              const focused = request.id === focusedRequestId;
              const elapsed = formatVNElapsedCompact(request.createdAt);

              return (
                <Item
                  key={request.id}
                  data-testid={`self-order-request-${request.id}`}
                  role="listitem"
                  variant="outline"
                  className={focused ? "border-primary bg-card" : "bg-card"}
                >
                  <ItemHeader className="items-start justify-between gap-2">
                    <ItemContent className="gap-1">
                      <div className="flex items-center gap-2">
                        <ItemTitle className="text-base font-semibold">
                          {tableNumber !== undefined
                            ? SELF_ORDER_VI.tableLabel(tableNumber)
                            : SELF_ORDER_VI.staffQueueTitle}
                        </ItemTitle>
                        {isNewSeating ? (
                          <Badge variant="success" className="text-xs">
                            {SELF_ORDER_VI.staffNewTable}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {SELF_ORDER_VI.staffAddMore}
                          </Badge>
                        )}
                      </div>
                      <ItemDescription className="text-xs tabular-nums">
                        {formatVNTime(request.createdAt, "--:--")}
                        {elapsed ? ` · ${elapsed}` : ""}
                      </ItemDescription>
                    </ItemContent>
                    <Badge variant="warning" className="shrink-0 text-xs">
                      QR ⏳
                    </Badge>
                  </ItemHeader>

                  <ItemGroup className="gap-1 border-t border-border pt-2">
                    {request.items.map((item, index) => {
                      const optionSummary = itemOptionSummary(item);
                      return (
                        <Item
                          key={
                            item.key ?? `${item.menu_item_id}-${index}`
                          }
                          size="sm"
                          className="px-0 py-1"
                        >
                          <ItemContent className="gap-1">
                            <ItemTitle className="text-sm">
                              {formatPortionQuantity(item.quantity)}{" "}
                              {item.item_name}
                              {item.variant_name
                                ? ` · ${item.variant_name}`
                                : ""}
                            </ItemTitle>
                            {optionSummary ? (
                              <ItemDescription className="max-h-16 overflow-y-auto break-words pr-1 text-xs">
                                {optionSummary}
                              </ItemDescription>
                            ) : null}
                          </ItemContent>
                          <ItemActions className="font-semibold tabular-nums text-sm">
                            {formatVND(itemTotal(item))}
                          </ItemActions>
                        </Item>
                      );
                    })}
                  </ItemGroup>

                  {request.customerNote ? (
                    <NoteCallout
                      tone="muted"
                      label={SELF_ORDER_VI.staffCustomerNote}
                    >
                      <div className="max-h-24 overflow-y-auto break-words pr-1 text-xs font-medium">
                        {request.customerNote}
                      </div>
                    </NoteCallout>
                  ) : null}

                  <div className="flex w-full items-center justify-between border-y py-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      {SELF_ORDER_VI.subtotal}
                    </span>
                    <span className="text-base font-semibold tabular-nums text-foreground">
                      {formatVND(provisionalTotal)}
                    </span>
                  </div>

                  {hasSingleOrder ? (
                    <p className="text-xs text-muted-foreground">
                      {SELF_ORDER_VI.staffAutoMergeIntoOrder(
                        activeOrders[0]?.order_number ?? "",
                      )}
                    </p>
                  ) : null}

                  {needsDestination ? (
                    <FieldSet className="gap-2">
                      <FieldLegend className="text-xs font-semibold">
                        {SELF_ORDER_VI.staffDestinationLabel}
                      </FieldLegend>
                      <RadioGroup
                        value={targetChoice}
                        onValueChange={(value) =>
                          setTargetByRequest((current) => ({
                            ...current,
                            [request.id]: value as TargetChoice,
                          }))
                        }
                        className="gap-2"
                      >
                        {activeOrders.map((order) => {
                          const value = `order:${order.id}` as const;
                          return (
                            <Item
                              key={order.id}
                              variant="outline"
                              size="sm"
                              render={
                                <FieldLabel
                                  htmlFor={`self-order-target-${request.id}-${order.id}`}
                                  className="w-full cursor-pointer items-center gap-3 font-normal"
                                />
                              }
                            >
                              <RadioGroupItem
                                id={`self-order-target-${request.id}-${order.id}`}
                                value={value}
                                size="touch"
                              />
                              <ItemContent>
                                <ItemTitle className="text-sm">
                                  {SELF_ORDER_VI.staffOrderLabel(
                                    order.order_number,
                                  )}
                                </ItemTitle>
                              </ItemContent>
                              <ItemActions className="tabular-nums text-xs">
                                {formatVND(order.total_amount)}
                              </ItemActions>
                            </Item>
                          );
                        })}
                        <Item
                          variant="outline"
                          size="sm"
                          render={
                            <FieldLabel
                              htmlFor={`self-order-target-${request.id}-new`}
                              className="w-full cursor-pointer items-center gap-3 font-normal"
                            />
                          }
                        >
                          <RadioGroupItem
                            id={`self-order-target-${request.id}-new`}
                            value="new"
                            size="touch"
                          />
                          <ItemContent>
                            <ItemTitle className="text-sm">
                              {SELF_ORDER_VI.staffApproveNewOrder}
                            </ItemTitle>
                          </ItemContent>
                        </Item>
                      </RadioGroup>
                    </FieldSet>
                  ) : null}

                  <ItemFooter className="grid grid-cols-2 gap-2 border-t border-border pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={() => void reject(request)}
                      disabled={isPending}
                    >
                      <IconX data-icon="inline-start" />
                      {SELF_ORDER_VI.staffReject}
                    </Button>
                    <Button
                      type="button"
                      size="touch"
                      onClick={() => approve(request)}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <IconCheck data-icon="inline-start" />
                      )}
                      {SELF_ORDER_VI.staffApprove}
                    </Button>
                  </ItemFooter>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </div>
    </StationSheet>
  );
}
