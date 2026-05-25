"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Ban as IconBan,
  Check as IconCheck,
  RotateCcw as IconRotate,
} from "lucide-react";
import {
  getStatusLabel,
  getStatusVariant,
  shouldShowTicketStatusBadge,
} from "../lib/status-config";
import {
  getItemRowStatusClass,
  getQuantityStatusClass,
} from "../lib/item-status-style";
import { CancelledOverlay } from "./cancelled-overlay";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrderItem, KdsTicket } from "../types";

interface TicketRowItemProps {
  kind: "item";
  item: KdsOrderItem;
  ticket: KdsTicket | undefined;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  isMutating: boolean;
  canMarkReady: boolean;
  canRecall: boolean;
}

interface TicketRowOrphanProps {
  kind: "orphan";
  ticket: KdsTicket;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  isMutating: boolean;
  canMarkReady: boolean;
  canRecall: boolean;
}

type TicketRowProps = TicketRowItemProps | TicketRowOrphanProps;
type RowChangeTone = "content" | "quantity" | "status" | "removed" | null;

export function TicketRow(props: TicketRowProps) {
  return props.kind === "item" ? (
    <TicketRowItem {...props} />
  ) : (
    <TicketRowOrphan {...props} />
  );
}

function TicketRowItem({
  item,
  ticket,
  onRecall,
  onOutOfStock,
  onCompleteTickets,
  isMutating,
  canMarkReady,
  canRecall,
}: TicketRowItemProps) {
  const status = ticket?.status ?? "pending";
  const isCancelled = status === "cancelled";
  const canCompleteByStatus =
    !isCancelled && (status === "pending" || status === "preparing");
  const canRecallByStatus =
    !isCancelled && (status === "preparing" || status === "ready");
  const canComplete = canCompleteByStatus && canMarkReady;
  const canOutOfStock = canCompleteByStatus && canMarkReady;
  const allowRecall = canRecallByStatus && canRecall;
  const changeTone = useItemChangeTone(item, status);

  return (
    <div
      data-testid={`kds-order-item-${String(item.id)}`}
      className={cn(
        "relative grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 transition-colors duration-300 md:px-4",
        getItemRowStatusClass(status),
        getChangeToneClass(changeTone),
        isCancelled && "opacity-100",
      )}
    >
      {isCancelled && <CancelledOverlay />}

      <div
        className={cn(
          "flex h-9 w-14 items-center justify-center rounded-md px-2 ring-1 ring-inset",
          getQuantityStatusClass(status),
        )}
      >
        <span className="font-mono text-2xl font-semibold leading-none tabular-nums">
          {item.quantity}×
        </span>
      </div>
      <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="min-w-0 break-words text-lg font-semibold leading-6">
          {item.item_name}
        </span>
        {item.is_priority && (
          <Badge
            variant="warning"
            className="h-6 rounded-md px-2 py-0 text-xs font-semibold leading-none"
          >
            Ưu tiên
          </Badge>
        )}
        {item.variant_name && (
          <span className="min-w-0 break-words text-sm font-medium leading-5 text-muted-foreground">
            {item.variant_name}
          </span>
        )}
        <TicketRowMeta
          layout="inline"
          note={item.note}
          modifiers={item.modifiers}
          sides={item.sides}
        />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1">
        {shouldShowTicketStatusBadge(status) && (
          <Badge
            variant={getStatusVariant(status)}
            className="h-6 rounded-md px-2.5 py-0 text-sm font-semibold leading-none"
          >
            {getStatusLabel(status)}
          </Badge>
        )}

        <TicketRowActions
          ticket={ticket ?? null}
          itemName={item.item_name}
          canComplete={canComplete}
          canRecall={allowRecall}
          canOutOfStock={canOutOfStock}
          isMutating={isMutating}
          onCompleteTickets={onCompleteTickets}
          onRecall={onRecall}
          onOutOfStock={onOutOfStock}
        />
      </div>
    </div>
  );
}

function TicketRowOrphan({
  ticket,
  onRecall,
  onOutOfStock,
  onCompleteTickets,
  isMutating,
  canMarkReady,
  canRecall,
}: TicketRowOrphanProps) {
  const status = ticket.status;
  const isCancelled = status === "cancelled";
  const canCompleteByStatus =
    !isCancelled && (status === "pending" || status === "preparing");
  const canRecallByStatus =
    !isCancelled && (status === "preparing" || status === "ready");
  const canComplete = canCompleteByStatus && canMarkReady;
  const canOutOfStock = canCompleteByStatus && canMarkReady;
  const allowRecall = canRecallByStatus && canRecall;
  const itemLabel = `Món #${String(ticket.order_item_id)}`;

  return (
    <div
      className={cn(
        "relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 md:px-4",
        getItemRowStatusClass(status),
      )}
    >
      {isCancelled && <CancelledOverlay />}
      <div className="min-h-9 min-w-0 rounded-md border border-dashed border-border px-2 py-1.5">
        <span className="break-words text-sm font-semibold leading-5 text-muted-foreground">
          {itemLabel}
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {shouldShowTicketStatusBadge(status) && (
          <Badge
            variant={getStatusVariant(status)}
            className="h-6 rounded-md px-2.5 py-0 text-sm font-semibold leading-none"
          >
            {getStatusLabel(status)}
          </Badge>
        )}
        <TicketRowActions
          ticket={ticket}
          itemName={itemLabel}
          canComplete={canComplete}
          canRecall={allowRecall}
          canOutOfStock={canOutOfStock}
          isMutating={isMutating}
          onCompleteTickets={onCompleteTickets}
          onRecall={onRecall}
          onOutOfStock={onOutOfStock}
        />
      </div>
    </div>
  );
}

interface TicketRowActionsProps {
  ticket: KdsTicket | null;
  itemName: string;
  canComplete: boolean;
  canRecall: boolean;
  canOutOfStock: boolean;
  isMutating: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
}

function TicketRowActions({
  ticket,
  itemName,
  canComplete,
  canRecall,
  canOutOfStock,
  isMutating,
  onCompleteTickets,
  onRecall,
  onOutOfStock,
}: TicketRowActionsProps) {
  if (!ticket) return null;

  async function handleOutOfStock() {
    if (!ticket) return;
    const ok = await confirm({
      title: "Báo hết món?",
      description: `${itemName} sẽ được hủy khỏi đơn và POS sẽ thấy thông báo để đổi món cho khách.`,
      confirmText: "Báo hết món",
      cancelText: "Giữ lại",
      variant: "destructive",
    });
    if (ok) {
      await onOutOfStock(ticket.id);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {canOutOfStock && (
        <Button
          data-testid={`kds-out-of-stock-${String(ticket.id)}`}
          variant="destructive"
          size="touch"
          className="w-12 px-0"
          aria-label="Báo hết món"
          disabled={isMutating}
          onClick={() => void handleOutOfStock()}
        >
          {isMutating ? <Spinner /> : <IconBan aria-hidden />}
        </Button>
      )}
      {canRecall && (
        <Button
          data-testid={`kds-recall-${String(ticket.id)}`}
          variant="outline"
          size="touch"
          className="w-12 px-0"
          aria-label="Thu hồi món"
          disabled={isMutating}
          onClick={() => void onRecall(ticket.id)}
        >
          {isMutating ? <Spinner /> : <IconRotate aria-hidden />}
        </Button>
      )}
      {canComplete && (
        <Button
          data-testid={`kds-complete-ticket-${String(ticket.id)}`}
          variant="default"
          size="touch"
          className="w-12 px-0"
          aria-label="Hoàn tất món"
          disabled={isMutating}
          onClick={() => void onCompleteTickets([ticket.id])}
        >
          {isMutating ? <Spinner /> : <IconCheck aria-hidden />}
        </Button>
      )}
    </div>
  );
}

function useItemChangeTone(item: KdsOrderItem, status: string): RowChangeTone {
  const signature = useMemo(
    () =>
      JSON.stringify({
        quantity: item.quantity,
        itemName: item.item_name,
        variantName: item.variant_name,
        unitPrice: item.unit_price,
        note: item.note,
        isPriority: item.is_priority,
        modifiers: item.modifiers,
        sides: item.sides,
        status,
      }),
    [
      item.item_name,
      item.is_priority,
      item.modifiers,
      item.note,
      item.quantity,
      item.sides,
      item.unit_price,
      item.variant_name,
      status,
    ],
  );
  const previousRef = useRef<{
    signature: string;
    quantity: number;
    status: string;
  } | null>(null);
  const [tone, setTone] = useState<RowChangeTone>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { signature, quantity: item.quantity, status };

    if (!previous || previous.signature === signature) return;

    const nextTone: RowChangeTone =
      status === "cancelled"
        ? "removed"
        : item.quantity !== previous.quantity
          ? "quantity"
          : status !== previous.status
            ? "status"
            : "content";

    setTone(nextTone);
    const timeout = window.setTimeout(() => setTone(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [item.quantity, signature, status]);

  return tone;
}

function getChangeToneClass(tone: RowChangeTone): string | false {
  if (tone === "quantity") {
    return "bg-warning/10 ring-2 ring-inset ring-warning/50 motion-safe:animate-pulse";
  }
  if (tone === "removed") {
    return "bg-destructive/10 ring-2 ring-inset ring-destructive/40";
  }
  if (tone === "status") {
    return "bg-success/10 ring-2 ring-inset ring-success/40";
  }
  if (tone === "content") {
    return "bg-info/10 ring-2 ring-inset ring-info/40";
  }
  return false;
}
