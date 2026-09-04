"use client";

import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { CheckCheck as IconCheckCheck } from "lucide-react";
import type { KdsTicket } from "../types";

interface BatchActionsProps {
  orderGroupKey: string;
  activeTickets: KdsTicket[];
  pendingTicketIds: Set<number>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  layout?: "footer" | "title";
}

export function BatchActions({
  orderGroupKey,
  activeTickets,
  pendingTicketIds,
  onCompleteTickets,
  layout = "footer",
}: BatchActionsProps) {
  if (activeTickets.length < 2) return null;

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
        ? `Hoàn tất ${activeTickets.length}`
        : "Hoàn tất"
      : fullLabel;

  const handleCompleteBatch = () => {
    void onCompleteTickets(activeTicketIds);
  };

  const action = (
    <Button
      data-testid={`kds-complete-order-${orderGroupKey}`}
      type="button"
      variant="default"
      size={layout === "title" ? "touch" : "touch-lg"}
      className={layout === "title" ? "px-2 font-semibold" : "w-full"}
      disabled={completeBatchBusy}
      onClick={() => {
        handleCompleteBatch();
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
    <div className="border-t p-3">
      <div className="grid w-full grid-cols-1 gap-2">{action}</div>
    </div>
  );
}
