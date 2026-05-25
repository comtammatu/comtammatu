"use client";

import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { CheckCheck as IconCheckCheck } from "lucide-react";
import { CardFooter } from "@comtammatu/ui/components/card";
import type { KdsTicket } from "../types";

interface BatchActionsProps {
  orderGroupKey: string;
  pendingTickets: KdsTicket[];
  preparingTickets: KdsTicket[];
  pendingTicketIds: Set<number>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  layout?: "footer" | "title";
}

export function BatchActions({
  orderGroupKey,
  pendingTickets,
  preparingTickets,
  pendingTicketIds,
  onCompleteTickets,
  layout = "footer",
}: BatchActionsProps) {
  if (pendingTickets.length === 0 && preparingTickets.length === 0) return null;

  const activeTickets = [...pendingTickets, ...preparingTickets];
  const activeTicketIds = activeTickets.map((ticket) => ticket.id);
  const completeBatchBusy =
    activeTickets.length > 0 &&
    activeTickets.every((ticket) => pendingTicketIds.has(ticket.id));
  const fullLabel =
    activeTickets.length > 1
      ? `Hoàn tất ${activeTickets.length} món`
      : "Hoàn tất phiếu bếp";
  const visibleLabel =
    layout === "title"
      ? activeTickets.length > 1
        ? `Xong ${activeTickets.length}`
        : "Xong"
      : fullLabel;

  const action = (
    <Button
      data-testid={`kds-complete-order-${orderGroupKey}`}
      type="button"
      variant="default"
      size={layout === "title" ? "touch" : "touch-lg"}
      className={layout === "title" ? "px-2.5 font-semibold" : "w-full"}
      disabled={completeBatchBusy}
      onClick={() => {
        void onCompleteTickets(activeTicketIds);
      }}
      aria-label={fullLabel}
    >
      {completeBatchBusy ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <IconCheckCheck data-icon="inline-start" aria-hidden />
      )}
      {visibleLabel}
    </Button>
  );

  if (layout === "title") {
    return action;
  }

  return (
    <CardFooter className="border-t p-2.5 md:p-3">
      <div className="grid w-full grid-cols-1 gap-2">{action}</div>
    </CardFooter>
  );
}
