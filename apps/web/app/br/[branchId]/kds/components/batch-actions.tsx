"use client";

import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Check as IconCheck, ChevronRight as IconChevronRight, Utensils as IconToolsKitchen } from "lucide-react";
import { CardFooter } from "@comtammatu/ui/components/card";
import type { KdsTicket } from "../types";

interface BatchActionsProps {
  pendingTickets: KdsTicket[];
  preparingTickets: KdsTicket[];
  pendingTicketIds: Set<number>;
  onBump: (ticketId: number) => Promise<void>;
}

export function BatchActions({
  pendingTickets,
  preparingTickets,
  pendingTicketIds,
  onBump,
}: BatchActionsProps) {
  if (pendingTickets.length === 0 && preparingTickets.length === 0) return null;

  const pendingBatchBusy =
    pendingTickets.length > 0 &&
    pendingTickets.every((ticket) => pendingTicketIds.has(ticket.id));
  const preparingBatchBusy =
    preparingTickets.length > 0 &&
    preparingTickets.every((ticket) => pendingTicketIds.has(ticket.id));

  return (
    <CardFooter className="border-t p-2.5 md:p-3">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {pendingTickets.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            className={cn(
              "min-h-12 rounded-md text-sm font-bold md:min-h-14 md:text-base",
              preparingTickets.length === 0 && "sm:col-span-2",
            )}
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
            className={cn(
              "min-h-12 rounded-md text-sm font-bold md:min-h-14 md:text-base",
              pendingTickets.length === 0 && "sm:col-span-2",
            )}
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
            Hòan thành {preparingTickets.length} món
          </Button>
        )}
      </div>
    </CardFooter>
  );
}
