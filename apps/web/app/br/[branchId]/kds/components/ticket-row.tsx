"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Check as IconCheck, ChevronRight as IconChevronRight, RotateCcw as IconRotate } from "lucide-react";
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
  isMutating: boolean;
  canMarkReady: boolean;
  canRecall: boolean;
}

interface TicketRowOrphanProps {
  kind: "orphan";
  ticket: KdsTicket;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  isMutating: boolean;
  canMarkReady: boolean;
  canRecall: boolean;
}

type TicketRowProps = TicketRowItemProps | TicketRowOrphanProps;

export function TicketRow(props: TicketRowProps) {
  if (props.kind === "item") {
    const { item, ticket, onBump, onRecall, isMutating, canMarkReady } = props;
    const status = ticket?.status ?? "pending";
    const isCancelled = status === "cancelled";
    const canBumpByStatus =
      !isCancelled && (status === "pending" || status === "preparing");
    const canRecallByStatus =
      !isCancelled && (status === "preparing" || status === "ready");
    const canBump = canBumpByStatus && canMarkReady;
    const canRecall = canRecallByStatus && props.canRecall;

    return (
      <div
        data-testid={`kds-order-item-${String(item.id)}`}
        className={cn(
          "relative flex min-h-14 items-start gap-2 px-3 py-3 md:min-h-16 md:gap-3 md:px-4",
          status === "ready" && "opacity-50",
          isCancelled && "opacity-100",
        )}
      >
        {isCancelled && <CancelledOverlay />}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-semibold leading-tight tabular-nums text-warning md:text-xl">
              {item.quantity}×
            </span>
            <span className="line-clamp-2 break-words text-lg font-semibold leading-tight md:text-xl">
              {item.item_name}
            </span>
          </div>
          {item.variant_name && (
            <span className="mt-0.5 block text-sm font-medium text-muted-foreground">
              {item.variant_name}
            </span>
          )}
          <TicketRowMeta
            note={item.note}
            modifiers={item.modifiers}
            sides={item.sides}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1 self-start pt-0.5">
          <Badge
            variant={getStatusVariant(status)}
            className="px-2 py-1 text-xs font-bold"
          >
            {getStatusLabel(status)}
          </Badge>

          <TicketRowActions
            ticket={ticket ?? null}
            status={status}
            canBump={canBump}
            canRecall={canRecall}
            isMutating={isMutating}
            onBump={onBump}
            onRecall={onRecall}
          />
        </div>
      </div>
    );
  }

  const { ticket, onBump, onRecall, isMutating, canMarkReady } = props;
  const status = ticket.status;
  const isCancelled = status === "cancelled";
  const canBumpByStatus =
    !isCancelled && (status === "pending" || status === "preparing");
  const canRecallByStatus =
    !isCancelled && (status === "preparing" || status === "ready");
  const canBump = canBumpByStatus && canMarkReady;
  const canRecall = canRecallByStatus && props.canRecall;

  return (
    <div className="flex min-h-14 items-start gap-2 px-3 py-2.5 md:min-h-16 md:gap-3 md:px-4 md:py-3">
      <div className="min-w-0 flex-1">
        <span className="text-base text-muted-foreground">
          Món #{String(ticket.order_item_id)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-start pt-0.5">
        <Badge
          variant={getStatusVariant(status)}
          className="px-2 py-1 text-xs font-bold"
        >
          {getStatusLabel(status)}
        </Badge>
        <TicketRowActions
          ticket={ticket}
          status={status}
          canBump={canBump}
          canRecall={canRecall}
          isMutating={isMutating}
          onBump={onBump}
          onRecall={onRecall}
        />
      </div>
    </div>
  );
}

interface TicketRowActionsProps {
  ticket: KdsTicket | null;
  status: string;
  canBump: boolean;
  canRecall: boolean;
  isMutating: boolean;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}

function TicketRowActions({
  ticket,
  status,
  canBump,
  canRecall,
  isMutating,
  onBump,
  onRecall,
}: TicketRowActionsProps) {
  if (!ticket) return null;

  return (
    <div className="flex shrink-0 gap-1">
      {canRecall && (
        <Button
          data-testid={`kds-recall-${String(ticket.id)}`}
          variant="outline"
          size="icon"
          className="size-11 rounded-md text-muted-foreground md:size-14"
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
          size="icon"
          className="size-11 rounded-md md:size-14"
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
