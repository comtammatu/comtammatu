"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
import { notify } from "@comtammatu/ui/lib/notify";
import { messages } from "@lib/messages";
import {
  listPendingPosVoidRequests,
  resolvePosVoidRequest,
  type PendingVoidRequest,
} from "../void-request-actions";

export function VoidRequestQueue({ branchId }: { branchId: number }) {
  const [requests, setRequests] = useState<PendingVoidRequest[]>([]);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listPendingPosVoidRequests({ branchId });
      if (result.success) {
        setRequests(result.data?.requests ?? []);
      }
    });
  }, [branchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function resolve(requestId: number, decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await resolvePosVoidRequest({
        requestId,
        decision,
        branchId,
      });
      if (result.success) {
        refresh();
      } else {
        notify.error(
          result.error ?? messages.pos.order.voidRequestResolveFailed,
        );
      }
    });
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <NoteCallout
      tone="warning"
      title={messages.pos.order.voidRequestQueueTitle}
      className="mb-3"
    >
      <ItemGroup className="mt-2 gap-2">
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
                onClick={() => resolve(request.id, "approved")}
              >
                {messages.pos.order.voidRequestApprove}
              </Button>
              <Button
                size="touch"
                variant="outline"
                disabled={isPending}
                onClick={() => resolve(request.id, "rejected")}
              >
                {messages.pos.order.voidRequestReject}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </NoteCallout>
  );
}
