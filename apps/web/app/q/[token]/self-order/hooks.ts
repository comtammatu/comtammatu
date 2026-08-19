"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import {
  publicSelfOrderSnapshotSchema,
  type PublicSelfOrderSnapshot,
} from "@lib/self-order/contracts";

export function useSnapshotSync(
  token: string,
  initialSnapshot: PublicSelfOrderSnapshot,
  clientOpId: string | null,
  onHistoryPrivacyScrub?: () => void,
) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrubRef = useRef(onHistoryPrivacyScrub);
  scrubRef.current = onHistoryPrivacyScrub;

  const refreshSnapshot = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRefreshing(true);
    try {
      const query = clientOpId
        ? `?clientOpId=${encodeURIComponent(clientOpId)}`
        : "";
      const response = await fetch(
        `/api/self-order/${encodeURIComponent(token)}${query}`,
        { method: "GET", cache: "no-store", signal: controller.signal },
      );
      const payload = await response.json().catch(() => null);
      if (generation !== generationRef.current) return false;
      const parsed = publicSelfOrderSnapshotSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        setRefreshError(SELF_ORDER_VI.refreshFailed);
        return false;
      }
      setSnapshot(parsed.data);
      setRefreshError(null);
      return true;
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current) {
        return false;
      }
      setRefreshError(SELF_ORDER_VI.refreshFailed);
      return false;
    } finally {
      if (generation === generationRef.current) {
        abortRef.current = null;
        setIsRefreshing(false);
      }
    }
  }, [clientOpId, token]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    const fast =
      snapshot.ok &&
      (snapshot.state === "awaiting_confirmation" ||
        (snapshot.order != null && snapshot.kitchenServed !== true));
    const timer = window.setInterval(
      () => void refreshSnapshot(),
      fast ? 3_000 : 15_000,
    );
    return () => window.clearInterval(timer);
  }, [refreshSnapshot, snapshot]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshSnapshot();
    }
    function refreshFromHistory(event: PageTransitionEvent) {
      if (!event.persisted) return;
      scrubRef.current?.();
      void refreshSnapshot();
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("pageshow", refreshFromHistory);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshFromHistory);
    };
  }, [refreshSnapshot]);

  return {
    snapshot,
    setSnapshot,
    refreshSnapshot,
    isRefreshing,
    refreshError,
    clearRefreshError: () => setRefreshError(null),
  };
}
