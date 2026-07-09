"use client";

import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Alert, AlertDescription, AlertTitle } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

interface SessionStatePanelProps {
  session: PublicSelfOrderSnapshot["session"];
  order: PublicSelfOrderSnapshot["order"];
  onViewBill?: () => void;
}

export function SessionStatePanel({
  session,
  order,
  onViewBill,
}: SessionStatePanelProps) {
  const status = session?.status ?? null;
  const isPaid =
    status === "closed" || order?.paymentStatus === "paid";

  if (status === "pending_approval") {
    return (
      <NoteCallout tone="warning" className="mx-3 mt-2">
        <p className="font-semibold">{SELF_ORDER_VI.pendingApprovalTitle}</p>
        <p className="mt-0.5 text-sm font-normal text-muted-foreground">
          {SELF_ORDER_VI.ctaAwaitingApprovalHint}
        </p>
      </NoteCallout>
    );
  }

  if (status === "revoked") {
    return (
      <Alert variant="destructive" className="mx-3 mt-2">
        <AlertTitle>{SELF_ORDER_VI.statusRejected}</AlertTitle>
        <AlertDescription>{SELF_ORDER_VI.ctaRejectedHint}</AlertDescription>
      </Alert>
    );
  }

  if (isPaid) {
    return (
      <NoteCallout tone="muted" className="mx-3 mt-2">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium">
            {SELF_ORDER_VI.closedTitle}
          </p>
          {onViewBill ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="shrink-0"
              onClick={onViewBill}
            >
              {SELF_ORDER_VI.viewBill}
            </Button>
          ) : null}
        </div>
      </NoteCallout>
    );
  }

  return null;
}
