"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { createClient } from "@comtammatu/database/supabase/client";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

async function readApiResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { ok?: boolean })
    | null;
  if (response.ok && payload && payload.ok !== false)
    return { ok: true, payload } as const;

  return {
    ok: false,
    error: {
      ok: false as const,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message:
        typeof payload?.message === "string" ? payload.message : undefined,
    },
  } as const;
}

function mergeSnapshotPreservingPairingCode(
  current: PublicSelfOrderSnapshot,
  incoming: PublicSelfOrderSnapshot,
): PublicSelfOrderSnapshot {
  const currentRequest = current.deviceRequest;
  const incomingRequest = incoming.deviceRequest;
  const pairingExpiry = incomingRequest?.pairingExpiresAt
    ? Date.parse(incomingRequest.pairingExpiresAt)
    : Number.NaN;
  const canPreserve =
    Boolean(currentRequest?.pairingCode) &&
    currentRequest?.deviceId === incomingRequest?.deviceId &&
    currentRequest?.status === incomingRequest?.status &&
    currentRequest?.pairingExpiresAt === incomingRequest?.pairingExpiresAt &&
    Number.isFinite(pairingExpiry) &&
    pairingExpiry > Date.now();
  const withPairingCode =
    canPreserve && incomingRequest && currentRequest?.pairingCode
      ? {
          ...incoming,
          deviceRequest: {
            ...incomingRequest,
            pairingCode: currentRequest.pairingCode,
          },
        }
      : incoming;
  const withScopedRecovery =
    withPairingCode.deviceRecovery === "expired" &&
    withPairingCode.seatingAccess !== "join_required"
      ? { ...withPairingCode, deviceRecovery: undefined }
      : withPairingCode;
  if (
    withScopedRecovery.deviceRecovery == null &&
    current.deviceRecovery === "expired" &&
    withScopedRecovery.access === "public" &&
    withScopedRecovery.seatingAccess === "join_required"
  ) {
    return { ...withScopedRecovery, deviceRecovery: "expired" };
  }
  return withScopedRecovery;
}

export function useSnapshotSync(
  token: string,
  initialSnapshot: PublicSelfOrderSnapshot,
  onHistoryPrivacyScrub?: () => void,
) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [isHistoryRestorePending, setIsHistoryRestorePending] = useState(false);
  const refreshGenerationRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const isBfcacheSuspendedRef = useRef(false);
  const historyPrivacyScrubbedRef = useRef(false);
  const onHistoryPrivacyScrubRef = useRef(onHistoryPrivacyScrub);
  onHistoryPrivacyScrubRef.current = onHistoryPrivacyScrub;

  const clearRefreshError = useCallback(() => setRefreshError(null), []);

  const commitSnapshot = useCallback(
    (next: SetStateAction<PublicSelfOrderSnapshot>) => {
      refreshGenerationRef.current += 1;
      refreshAbortRef.current?.abort();
      refreshAbortRef.current = null;
      setSnapshot(next);
      setIsRefreshing(false);
    },
    [],
  );

  const refreshSnapshot = useCallback(async () => {
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    setIsRefreshing(true);
    try {
      const response = await fetch(
        `/api/self-order/${encodeURIComponent(token)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      const result = await readApiResponse(response);
      if (generation !== refreshGenerationRef.current) return false;
      if (result.ok && result.payload) {
        setSnapshot((current) =>
          mergeSnapshotPreservingPairingCode(
            current,
            result.payload as unknown as PublicSelfOrderSnapshot,
          ),
        );
        setTerminalError(null);
        setRefreshError(null);
        if (!isBfcacheSuspendedRef.current) {
          historyPrivacyScrubbedRef.current = false;
          setIsHistoryRestorePending(false);
        }
        return true;
      }
      if (
        result.error.code === "not_found" ||
        result.error.code === "pos_session_closed"
      ) {
        setTerminalError(
          result.error.message ?? SELF_ORDER_VI.unavailableDescription,
        );
        setRefreshError(null);
        return false;
      }
      setRefreshError(SELF_ORDER_VI.refreshFailed);
      return false;
    } catch {
      if (
        controller.signal.aborted ||
        generation !== refreshGenerationRef.current
      ) {
        return false;
      }
      setRefreshError(SELF_ORDER_VI.refreshFailed);
      return false;
    } finally {
      if (generation === refreshGenerationRef.current) {
        refreshAbortRef.current = null;
        setIsRefreshing(false);
      }
    }
  }, [token]);

  useEffect(
    () => () => {
      refreshGenerationRef.current += 1;
      refreshAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!snapshot.realtimeTopic) return;
    const supabase = createClient();
    let subscribedOnce = false;
    const channel = supabase
      .channel(snapshot.realtimeTopic)
      .on("broadcast", { event: "session_changed" }, () => {
        void refreshSnapshot();
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (subscribedOnce) void refreshSnapshot();
        subscribedOnce = true;
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshSnapshot, snapshot.realtimeTopic]);

  useEffect(() => {
    function scrubHistoryState() {
      if (historyPrivacyScrubbedRef.current) return;
      historyPrivacyScrubbedRef.current = true;
      flushSync(() => {
        setIsHistoryRestorePending(true);
        onHistoryPrivacyScrubRef.current?.();
      });
    }

    function handlePageHide(event: PageTransitionEvent) {
      if (!event.persisted) return;
      isBfcacheSuspendedRef.current = true;
      scrubHistoryState();
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      isBfcacheSuspendedRef.current = false;
      scrubHistoryState();
      void refreshSnapshot();
    }

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshSnapshot();
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [refreshSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot]);

  return {
    snapshot,
    setSnapshot: commitSnapshot,
    refreshSnapshot,
    isRefreshing,
    refreshError,
    terminalError,
    isHistoryRestorePending,
    clearRefreshError,
  };
}
