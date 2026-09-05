"use client";

import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState, StationSheet } from "@/components/surface";
import { messages } from "@lib/messages";
import { usePosVoidRequestQueue } from "../_hooks/use-pos-void-request-queue";
import type { PendingVoidRequest } from "../void-request-actions";

function VoidRequestList({
  requests,
  isPending,
  onResolve,
}: {
  requests: readonly PendingVoidRequest[];
  isPending: boolean;
  onResolve: (
    requestId: number,
    decision: "approved" | "rejected",
  ) => void;
}) {
  return (
    <ItemGroup className="gap-2">
      {requests.map((request) => (
        <Item key={request.id} variant="outline" size="sm">
          <ItemContent>
            <ItemTitle className="text-sm">
              {messages.pos.order.voidRequestOrderLabel(request.order_id)}
            </ItemTitle>
            <ItemDescription className="text-xs line-clamp-2">
              {request.reason}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="flex flex-col gap-1 sm:flex-row">
            <Button
              size="touch"
              variant="destructive"
              disabled={isPending}
              onClick={() => onResolve(request.id, "approved")}
            >
              {messages.pos.order.voidRequestApprove}
            </Button>
            <Button
              size="touch"
              variant="outline"
              disabled={isPending}
              onClick={() => onResolve(request.id, "rejected")}
            >
              {messages.pos.order.voidRequestReject}
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

/** Operator orders LIST keeps an inline banner; POS chrome uses the sheet. */
export function VoidRequestQueue({ branchId }: { branchId: number }) {
  const { requests, isPending, resolve } = usePosVoidRequestQueue(branchId);

  if (requests.length === 0) {
    return null;
  }

  return (
    <NoteCallout
      tone="warning"
      title={messages.pos.order.voidRequestQueueTitle}
      className="mb-3"
    >
      <div className="mt-2">
        <VoidRequestList
          requests={requests}
          isPending={isPending}
          onResolve={resolve}
        />
      </div>
    </NoteCallout>
  );
}

export function VoidRequestSheet({
  open,
  onOpenChange,
  requests,
  isPending,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requests: readonly PendingVoidRequest[];
  isPending: boolean;
  onResolve: (
    requestId: number,
    decision: "approved" | "rejected",
  ) => void;
}) {
  return (
    <StationSheet
      open={open}
      onOpenChange={onOpenChange}
      title={messages.pos.order.voidRequestQueueTitle}
      description={messages.pos.order.voidRequestQueueDescription}
      closeButtonSize="icon-touch"
      contentClassName="w-full sm:max-w-xl"
    >
      {requests.length === 0 ? (
        <AppEmptyState
          title={messages.pos.order.voidRequestEmpty}
          compact
          symbol="riceBowl"
        />
      ) : (
        <VoidRequestList
          requests={requests}
          isPending={isPending}
          onResolve={onResolve}
        />
      )}
    </StationSheet>
  );
}
