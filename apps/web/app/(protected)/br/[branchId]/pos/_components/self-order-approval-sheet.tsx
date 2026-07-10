"use client";

import { useMemo, useState, useTransition } from "react";
import { Check as IconCheck, X as IconX } from "lucide-react";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVNTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@comtammatu/ui/components/field";
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
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
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
  type SelfOrderStoredCartItem,
} from "../self-order-actions";

interface SelfOrderApprovalSheetProps {
  open: boolean;
  requests: SelfOrderPendingRequest[];
  focusedRequestId: number | null;
  tableNumberById: ReadonlyMap<number, number>;
  orders: SessionOrder[];
  onOpenChange: (open: boolean) => void;
  onUpdated: () => Promise<void> | void;
}

type TargetChoice = "" | "new" | `order:${number}`;

function itemOptionSummary(item: SelfOrderStoredCartItem) {
  return [
    ...item.modifiers.map((modifier) => modifier.name),
    ...item.sides.map((side) =>
      side.quantity > 1
        ? `${formatCount(side.quantity)}x ${side.name}`
        : side.name,
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
  focusedRequestId,
  tableNumberById,
  orders,
  onOpenChange,
  onUpdated,
}: SelfOrderApprovalSheetProps) {
  const [targetByRequest, setTargetByRequest] = useState<
    Record<number, TargetChoice>
  >({});
  const [isPending, startTransition] = useTransition();
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full p-0 sm:max-w-xl">
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b px-4 py-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle>{SELF_ORDER_VI.staffQueueTitle}</SheetTitle>
              {requests.length > 0 ? (
                <Badge variant="warning">{formatCount(requests.length)}</Badge>
              ) : null}
            </div>
            <SheetDescription>
              {SELF_ORDER_VI.staffQueueDescription}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              {displayedRequests.length === 0 ? (
                <Item variant="outline" className="border-dashed">
                  <ItemDescription>
                    {SELF_ORDER_VI.staffQueueEmpty}
                  </ItemDescription>
                </Item>
              ) : (
                <ItemGroup role="list" className="gap-3">
                  {displayedRequests.map((request) => {
                    const activeOrders =
                      activeOrdersByTable.get(request.tableId) ?? [];
                    const needsDestination = activeOrders.length >= 2;
                    const targetChoice = targetByRequest[request.id] ?? "";
                    const provisionalTotal = request.items.reduce(
                      (sum, item) => sum + itemTotal(item),
                      0,
                    );
                    const tableNumber = tableNumberById.get(request.tableId);
                    const focused = request.id === focusedRequestId;

                    return (
                      <Item
                        key={request.id}
                        data-testid={`self-order-request-${request.id}`}
                        role="listitem"
                        variant="outline"
                        className={
                          focused ? "border-primary bg-card" : "bg-card"
                        }
                      >
                        <ItemHeader>
                          <ItemContent>
                            <ItemTitle>
                              {tableNumber !== undefined
                                ? SELF_ORDER_VI.tableLabel(tableNumber)
                                : SELF_ORDER_VI.staffQueueTitle}
                            </ItemTitle>
                            <ItemDescription>
                              {SELF_ORDER_VI.staffRequestedAt(
                                formatVNTime(request.createdAt, "--:--"),
                              )}
                            </ItemDescription>
                          </ItemContent>
                          <Badge variant="warning">QR ⏳</Badge>
                        </ItemHeader>

                        <ItemGroup className="gap-1">
                          {request.items.map((item, index) => {
                            const optionSummary = itemOptionSummary(item);
                            return (
                              <Item
                                key={
                                  item.key ?? `${item.menu_item_id}-${index}`
                                }
                                size="sm"
                              >
                                <ItemContent>
                                  <ItemTitle>
                                    {formatCount(item.quantity)}x{" "}
                                    {item.item_name}
                                    {item.variant_name
                                      ? ` · ${item.variant_name}`
                                      : ""}
                                  </ItemTitle>
                                  {optionSummary ? (
                                    <ItemDescription>
                                      {optionSummary}
                                    </ItemDescription>
                                  ) : null}
                                </ItemContent>
                                <ItemActions className="font-medium tabular-nums">
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
                            {request.customerNote}
                          </NoteCallout>
                        ) : null}

                        <div className="flex items-center justify-between border-y py-3">
                          <span className="text-sm font-medium">
                            {SELF_ORDER_VI.subtotal}
                          </span>
                          <span className="text-lg font-semibold tabular-nums">
                            {formatVND(provisionalTotal)}
                          </span>
                        </div>

                        {needsDestination ? (
                          <FieldSet className="gap-2">
                            <FieldLegend>
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
                                    asChild
                                    variant="outline"
                                  >
                                    <FieldLabel
                                      htmlFor={`self-order-target-${request.id}-${order.id}`}
                                      className="w-full cursor-pointer items-center gap-3 font-normal"
                                    >
                                      <RadioGroupItem
                                        id={`self-order-target-${request.id}-${order.id}`}
                                        value={value}
                                        size="touch"
                                      />
                                      <ItemContent>
                                        <ItemTitle>
                                          {SELF_ORDER_VI.staffOrderLabel(
                                            order.order_number,
                                          )}
                                        </ItemTitle>
                                      </ItemContent>
                                      <ItemActions>
                                        {formatVND(order.total_amount)}
                                      </ItemActions>
                                    </FieldLabel>
                                  </Item>
                                );
                              })}
                              <Item asChild variant="outline">
                                <FieldLabel
                                  htmlFor={`self-order-target-${request.id}-new`}
                                  className="w-full cursor-pointer items-center gap-3 font-normal"
                                >
                                  <RadioGroupItem
                                    id={`self-order-target-${request.id}-new`}
                                    value="new"
                                    size="touch"
                                  />
                                  <ItemContent>
                                    <ItemTitle>
                                      {SELF_ORDER_VI.staffApproveNewOrder}
                                    </ItemTitle>
                                  </ItemContent>
                                </FieldLabel>
                              </Item>
                            </RadioGroup>
                          </FieldSet>
                        ) : null}

                        <ItemFooter className="grid grid-cols-2 gap-2 border-t pt-3">
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
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
