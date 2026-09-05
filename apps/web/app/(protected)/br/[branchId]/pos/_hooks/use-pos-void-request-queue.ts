"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { subscribeBranchOps } from "@/_hooks/branch-ops-runtime";
import { dedupeInflight } from "@/_utils/inflight-dedupe";
import { messages } from "@lib/messages";
import {
  listPendingPosVoidRequests,
  resolvePosVoidRequest,
  type PendingVoidRequest,
} from "../void-request-actions";

export interface UsePosVoidRequestQueueReturn {
  requests: PendingVoidRequest[];
  syncFailed: boolean;
  actionVisible: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  isPending: boolean;
  refresh: () => Promise<void>;
  handleOpen: () => void;
  resolve: (
    requestId: number,
    decision: "approved" | "rejected",
  ) => void;
}

/**
 * Pending paid-void queue for POS chrome and the operator orders banner.
 * Poll + visibility are the safety net; reconnect catch-up rides the shared
 * branch-ops channel (pos_void_requests has no dedicated broadcast trigger).
 */
export function usePosVoidRequestQueue(
  branchId: number,
): UsePosVoidRequestQueueReturn {
  const [requests, setRequests] = useState<PendingVoidRequest[]>([]);
  const [syncFailed, setSyncFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const loadGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    const result = await dedupeInflight(
      `listPendingPosVoidRequests:${String(branchId)}`,
      () => listPendingPosVoidRequests({ branchId }),
    ).catch(() => null);
    if (generation !== loadGenerationRef.current) {
      return;
    }
    if (!result?.success) {
      setSyncFailed(true);
      return;
    }
    setSyncFailed(false);
    setRequests(result.data?.requests ?? []);
  }, [branchId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      loadGenerationRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const stop = subscribeBranchOps({
      branchId,
      filter: { tables: ["pos_void_requests"] },
      onInvalidate: () => {
        if (!cancelled) void refresh();
      },
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [branchId, refresh]);

  const handleOpen = useCallback(() => {
    if (syncFailed && requests.length === 0) {
      void refresh();
      return;
    }
    if (syncFailed) void refresh();
    setOpen(true);
  }, [refresh, requests.length, syncFailed]);

  const resolve = useCallback(
    (requestId: number, decision: "approved" | "rejected") => {
      startTransition(async () => {
        const result = await resolvePosVoidRequest({
          requestId,
          decision,
          branchId,
        });
        if (result.success) {
          toast.success(messages.pos.order.voidRequestResolved);
          await refresh();
          return;
        }
        toast.error(
          result.error ?? messages.pos.order.voidRequestResolveFailed,
        );
      });
    },
    [branchId, refresh],
  );

  useEffect(() => {
    if (open && !syncFailed && !isPending && requests.length === 0) {
      setOpen(false);
    }
  }, [isPending, open, requests.length, syncFailed]);

  return {
    requests,
    syncFailed,
    actionVisible: syncFailed || requests.length > 0,
    open,
    setOpen,
    isPending,
    refresh,
    handleOpen,
    resolve,
  };
}
