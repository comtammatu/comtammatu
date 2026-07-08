"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  BellRing as IconBell,
  Check as IconCheck,
  RefreshCw as IconRefresh,
  X as IconX,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import type { SessionOrder } from "../order-history";
import { ACTIVE_POS_STATUSES } from "../order-history";
import {
  approveSelfOrderBatch,
  fetchSelfOrderStaffQueue,
  rejectSelfOrderBatch,
  type SelfOrderPendingBatch,
  type SelfOrderStaffQueue,
} from "../self-order-actions";

interface SelfOrderApprovalSheetProps {
  branchId: number;
  posSessionId: number;
  orders: SessionOrder[];
  onUpdated: () => Promise<void> | void;
}

type TargetChoice = "new" | `order:${number}`;

export function SelfOrderApprovalSheet({
  branchId,
  posSessionId,
  orders,
  onUpdated,
}: SelfOrderApprovalSheetProps) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<SelfOrderStaffQueue>({
    pendingBatches: [],
    paymentRequests: [],
  });
  const [targetByBatch, setTargetByBatch] = useState<Record<number, TargetChoice>>(
    {},
  );
  const [isPending, startTransition] = useTransition();

  const loadQueue = useCallback(async () => {
    const result = await fetchSelfOrderStaffQueue(branchId);
    if (!result.success) {
      toast.error(result.error ?? SELF_ORDER_VI.staffLoadFailed);
      return;
    }
    setQueue(
      result.data ?? {
        pendingBatches: [],
        paymentRequests: [],
      },
    );
  }, [branchId]);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => {
      void loadQueue();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  const count = queue.pendingBatches.length + queue.paymentRequests.length;

  function approve(batch: SelfOrderPendingBatch) {
    const choice = targetByBatch[batch.id] ?? "new";
    const targetOrderId =
      choice === "new" ? null : Number(choice.replace("order:", ""));
    if (choice !== "new" && !Number.isFinite(targetOrderId)) {
      toast.error(SELF_ORDER_VI.staffTargetRequired);
      return;
    }

    startTransition(async () => {
      const result = await approveSelfOrderBatch({
        batchId: batch.id,
        targetOrderId,
        posSessionId,
      });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }
      toast.success(SELF_ORDER_VI.staffApproved);
      await loadQueue();
      void onUpdated();
    });
  }

  function reject(batch: SelfOrderPendingBatch) {
    startTransition(async () => {
      const result = await rejectSelfOrderBatch({ batchId: batch.id });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }
      toast.success(SELF_ORDER_VI.staffRejected);
      await loadQueue();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="fixed right-3 bottom-20 z-40 lg:bottom-4"
        onClick={() => {
          setOpen(true);
          void loadQueue();
        }}
      >
        <IconBell data-icon="inline-start" />
        <span>{SELF_ORDER_VI.staffQueueButton}</span>
        {count > 0 ? <Badge variant="warning">{count}</Badge> : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{SELF_ORDER_VI.staffQueueTitle}</SheetTitle>
            <SheetDescription>{SELF_ORDER_VI.staffQueueDescription}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadQueue()}
              >
                <IconRefresh data-icon="inline-start" />
                {SELF_ORDER_VI.staffQueueButton}
              </Button>
            </div>

            {count === 0 ? (
              <Item variant="outline" className="border-dashed">
                <ItemDescription>{SELF_ORDER_VI.staffQueueEmpty}</ItemDescription>
              </Item>
            ) : null}

            {queue.pendingBatches.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {SELF_ORDER_VI.staffPendingBatches}
                </h3>
                {queue.pendingBatches.map((batch) => (
                  <PendingBatchCard
                    key={batch.id}
                    batch={batch}
                    orders={orders}
                    selected={targetByBatch[batch.id] ?? "new"}
                    isPending={isPending}
                    onSelectedChange={(choice) =>
                      setTargetByBatch((current) => ({
                        ...current,
                        [batch.id]: choice,
                      }))
                    }
                    onApprove={() => approve(batch)}
                    onReject={() => reject(batch)}
                  />
                ))}
              </section>
            ) : null}

            {queue.paymentRequests.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {SELF_ORDER_VI.staffPaymentRequests}
                </h3>
                <ItemGroup data-size="sm">
                  {queue.paymentRequests.map((request) => (
                    <Item key={request.id} variant="outline" className="flex-col">
                      <ItemHeader>
                        <ItemContent>
                          <ItemTitle>
                            {SELF_ORDER_VI.tableLabel(request.tableNumber)}
                          </ItemTitle>
                          <ItemDescription>#{request.orderNumber}</ItemDescription>
                        </ItemContent>
                        <Badge
                          variant={
                            request.status === "cash_call" ? "warning" : "info"
                          }
                        >
                          {request.status === "cash_call"
                            ? SELF_ORDER_VI.cashCallStaff
                            : SELF_ORDER_VI.vietQrPendingStaff}
                        </Badge>
                      </ItemHeader>
                      <ItemFooter>
                        <span className="text-sm font-bold">
                          {formatVND(request.amount)}
                        </span>
                      </ItemFooter>
                    </Item>
                  ))}
                </ItemGroup>
              </section>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function PendingBatchCard({
  batch,
  orders,
  selected,
  isPending,
  onSelectedChange,
  onApprove,
  onReject,
}: {
  batch: SelfOrderPendingBatch;
  orders: SessionOrder[];
  selected: TargetChoice;
  isPending: boolean;
  onSelectedChange: (choice: TargetChoice) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const tableOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.table_id === batch.tableId &&
          ACTIVE_POS_STATUSES.includes(order.status) &&
          order.payment_status !== "paid",
      ),
    [batch.tableId, orders],
  );
  const quantity = batch.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Item variant="outline" className="flex-col items-stretch">
      <ItemHeader>
        <ItemContent>
          <ItemTitle>{SELF_ORDER_VI.tableLabel(batch.tableNumber)}</ItemTitle>
          <ItemDescription>
            {SELF_ORDER_VI.staffPendingBatches} · {quantity}
          </ItemDescription>
        </ItemContent>
        <Badge variant="warning">{batch.status}</Badge>
      </ItemHeader>

      <ul className="flex flex-col gap-1 text-sm">
        {batch.items.map((item, index) => (
          <li
            key={`${batch.id}:${item.menu_item_id}:${index}`}
            className="flex justify-between gap-3"
          >
            <span className="min-w-0 truncate">
              {item.variant_name
                ? `${item.item_name} ${item.variant_name}`
                : item.item_name}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              x{item.quantity}
            </span>
          </li>
        ))}
      </ul>

      {batch.customerNote ? (
        <NoteCallout tone="muted" className="text-xs">
          {batch.customerNote}
        </NoteCallout>
      ) : null}

      <div className="grid gap-2">
        <TargetButton
          active={selected === "new"}
          onClick={() => onSelectedChange("new")}
        >
          {SELF_ORDER_VI.staffApproveNewOrder}
        </TargetButton>
        {tableOrders.map((order) => (
          <TargetButton
            key={order.id}
            active={selected === `order:${order.id}`}
            onClick={() => onSelectedChange(`order:${order.id}`)}
          >
            {SELF_ORDER_VI.staffApproveAppend} #{order.order_number} ·{" "}
            {formatVND(order.total_amount)}
          </TargetButton>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={isPending}
          onClick={onReject}
        >
          <IconX data-icon="inline-start" />
          {SELF_ORDER_VI.staffReject}
        </Button>
        <Button
          type="button"
          size="touch"
          disabled={isPending}
          onClick={onApprove}
        >
          <IconCheck data-icon="inline-start" />
          {SELF_ORDER_VI.staffApprove}
        </Button>
      </div>
    </Item>
  );
}

function TargetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="touch"
      className="w-full justify-start whitespace-normal text-left"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
