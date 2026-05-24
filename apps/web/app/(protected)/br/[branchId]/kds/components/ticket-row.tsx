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
  ChevronRight as IconChevronRight,
  RotateCcw as IconRotate,
} from "lucide-react";
import { getStatusLabel, getStatusVariant } from "../lib/status-config";
import { CancelledOverlay } from "./cancelled-overlay";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrderItem, KdsTicket } from "../types";

interface TicketRowItemProps {
  kind: "item";
  item: KdsOrderItem;
  ticket: KdsTicket | undefined;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  isMutating: boolean;
  canMarkReady: boolean;
  canRecall: boolean;
}

interface TicketRowOrphanProps {
  kind: "orphan";
  ticket: KdsTicket;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
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
  onBump,
  onRecall,
  onOutOfStock,
  isMutating,
  canMarkReady,
  canRecall,
}: TicketRowItemProps) {
  const status = ticket?.status ?? "pending";
  const isCancelled = status === "cancelled";
  const canBumpByStatus =
    !isCancelled && (status === "pending" || status === "preparing");
  const canRecallByStatus =
    !isCancelled && (status === "preparing" || status === "ready");
  const canBump = canBumpByStatus && canMarkReady;
  const canOutOfStock = canBumpByStatus && canMarkReady;
  const allowRecall = canRecallByStatus && canRecall;
  const changeTone = useItemChangeTone(item, status);

  return (
    <div
      data-testid={`kds-order-item-${String(item.id)}`}
      className={cn(
        "relative flex min-h-20 flex-col gap-3 px-3 py-3 transition-colors duration-300 sm:flex-row sm:items-start md:px-4 md:py-4",
        getChangeToneClass(changeTone),
        status === "ready" && "opacity-60",
        isCancelled && "opacity-100",
      )}
    >
      {isCancelled && <CancelledOverlay />}

      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex min-w-14 shrink-0 justify-center rounded-md bg-warning/10 px-2 py-1 text-warning ring-1 ring-inset ring-warning/30">
          <span className="font-mono text-2xl font-semibold leading-none tabular-nums md:text-3xl">
            {item.quantity}×
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="block min-w-0 break-words text-xl font-semibold leading-tight md:text-2xl">
            {item.item_name}
          </span>
          {item.variant_name && (
            <span className="mt-1 block break-words text-sm font-medium text-muted-foreground md:text-base">
              {item.variant_name}
            </span>
          )}
          <TicketRowMeta
            note={item.note}
            modifiers={item.modifiers}
            sides={item.sides}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 self-start sm:max-w-32 sm:shrink-0 sm:justify-end md:max-w-40">
        <Badge
          variant={getStatusVariant(status)}
          className="px-2 py-1 text-xs font-semibold"
        >
          {getStatusLabel(status)}
        </Badge>

        <TicketRowActions
          ticket={ticket ?? null}
          itemName={item.item_name}
          status={status}
          canBump={canBump}
          canRecall={allowRecall}
          canOutOfStock={canOutOfStock}
          isMutating={isMutating}
          onBump={onBump}
          onRecall={onRecall}
          onOutOfStock={onOutOfStock}
        />
      </div>
    </div>
  );
}

function TicketRowOrphan({
  ticket,
  onBump,
  onRecall,
  onOutOfStock,
  isMutating,
  canMarkReady,
  canRecall,
}: TicketRowOrphanProps) {
  const status = ticket.status;
  const isCancelled = status === "cancelled";
  const canBumpByStatus =
    !isCancelled && (status === "pending" || status === "preparing");
  const canRecallByStatus =
    !isCancelled && (status === "preparing" || status === "ready");
  const canBump = canBumpByStatus && canMarkReady;
  const canOutOfStock = canBumpByStatus && canMarkReady;
  const allowRecall = canRecallByStatus && canRecall;
  const itemLabel = `Món #${String(ticket.order_item_id)}`;

  return (
    <div className="relative flex min-h-20 flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start md:px-4 md:py-4">
      {isCancelled && <CancelledOverlay />}
      <div className="min-w-0 flex-1 rounded-md border border-dashed border-border px-3 py-2">
        <span className="break-words text-base font-semibold text-muted-foreground">
          {itemLabel}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 self-start sm:max-w-32 sm:shrink-0 sm:justify-end md:max-w-40">
        <Badge
          variant={getStatusVariant(status)}
          className="px-2 py-1 text-xs font-semibold"
        >
          {getStatusLabel(status)}
        </Badge>
        <TicketRowActions
          ticket={ticket}
          itemName={itemLabel}
          status={status}
          canBump={canBump}
          canRecall={allowRecall}
          canOutOfStock={canOutOfStock}
          isMutating={isMutating}
          onBump={onBump}
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
  status: string;
  canBump: boolean;
  canRecall: boolean;
  canOutOfStock: boolean;
  isMutating: boolean;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
}

function TicketRowActions({
  ticket,
  itemName,
  status,
  canBump,
  canRecall,
  canOutOfStock,
  isMutating,
  onBump,
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
    <div className="flex shrink-0 flex-wrap gap-1">
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
      {canBump && (
        <Button
          data-testid={`kds-bump-${String(ticket.id)}`}
          variant={status === "preparing" ? "default" : "secondary"}
          size="touch"
          className="w-12 px-0"
          aria-label="Chuyển trạng thái món"
          disabled={isMutating}
          onClick={() => void onBump(ticket.id)}
        >
          {isMutating ? (
            <Spinner />
          ) : status === "preparing" ? (
            <IconCheck aria-hidden />
          ) : (
            <IconChevronRight aria-hidden />
          )}
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
        modifiers: item.modifiers,
        sides: item.sides,
        status,
      }),
    [
      item.item_name,
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
