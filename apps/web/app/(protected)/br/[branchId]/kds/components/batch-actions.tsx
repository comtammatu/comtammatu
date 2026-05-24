"use client";

import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Check as IconCheck,
  CheckCheck as IconCheckCheck,
  ChevronRight as IconChevronRight,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import { CardFooter } from "@comtammatu/ui/components/card";
import type { KdsTicket } from "../types";

interface BatchActionsProps {
  orderGroupKey: string;
  pendingTickets: KdsTicket[];
  preparingTickets: KdsTicket[];
  pendingTicketIds: Set<number>;
  onBump: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}

export function BatchActions({
  orderGroupKey,
  pendingTickets,
  preparingTickets,
  pendingTicketIds,
  onBump,
  onCompleteTickets,
}: BatchActionsProps) {
  if (pendingTickets.length === 0 && preparingTickets.length === 0) return null;

  const activeTickets = [...pendingTickets, ...preparingTickets];
  const activeTicketIds = activeTickets.map((ticket) => ticket.id);
  const completeBatchBusy =
    activeTickets.length > 0 &&
    activeTickets.every((ticket) => pendingTicketIds.has(ticket.id));
  const pendingBatchBusy =
    pendingTickets.length > 0 &&
    pendingTickets.every((ticket) => pendingTicketIds.has(ticket.id));
  const preparingBatchBusy =
    preparingTickets.length > 0 &&
    preparingTickets.every((ticket) => pendingTicketIds.has(ticket.id));

  return (
    <CardFooter className="border-t p-2.5 md:p-3">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          data-testid={`kds-complete-order-${orderGroupKey}`}
          type="button"
          variant="default"
          size="touch-lg"
          className="sm:col-span-2"
          disabled={completeBatchBusy}
          onClick={() => {
            void onCompleteTickets(activeTicketIds);
          }}
        >
          {completeBatchBusy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconCheckCheck data-icon="inline-start" aria-hidden />
          )}
          Hoàn tất phiếu bếp
        </Button>
        {pendingTickets.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="touch-lg"
            className={cn(preparingTickets.length === 0 && "sm:col-span-2")}
            disabled={pendingBatchBusy}
            onClick={() => {
              void Promise.all(pendingTickets.map((t) => onBump(t.id)));
            }}
          >
            {pendingBatchBusy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconToolsKitchen data-icon="inline-start" aria-hidden />
            )}
            Bắt đầu {pendingTickets.length} món chờ
            <IconChevronRight data-icon="inline-end" aria-hidden />
          </Button>
        )}
        {preparingTickets.length > 0 && (
          <Button
            type="button"
            variant="default"
            size="touch-lg"
            className={cn(pendingTickets.length === 0 && "sm:col-span-2")}
            disabled={preparingBatchBusy}
            onClick={() => {
              void Promise.all(preparingTickets.map((t) => onBump(t.id)));
            }}
          >
            {preparingBatchBusy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCheck data-icon="inline-start" aria-hidden />
            )}
            Hoàn thành {preparingTickets.length} món
          </Button>
        )}
      </div>
    </CardFooter>
  );
}
