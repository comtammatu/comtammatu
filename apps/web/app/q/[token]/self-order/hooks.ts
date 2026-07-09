"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

async function readApiResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { ok?: boolean })
    | null;
  if (response.ok && payload?.ok !== false) return { ok: true, payload } as const;

  return {
    ok: false,
    error: {
      ok: false as const,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message: typeof payload?.message === "string" ? payload.message : undefined,
    },
  } as const;
}

export function useSnapshotSync(
  token: string,
  initialSnapshot: PublicSelfOrderSnapshot,
) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const clearRefreshError = useCallback(() => setRefreshError(null), []);

  const refreshSnapshot = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/self-order/${encodeURIComponent(token)}`, {
        method: "GET",
        cache: "no-store",
      });
      const result = await readApiResponse(response);
      if (result.ok && result.payload) {
        setSnapshot(result.payload as unknown as PublicSelfOrderSnapshot);
        setRefreshError(null);
        return true;
      }
      setRefreshError(SELF_ORDER_VI.refreshFailed);
      return false;
    } catch {
      setRefreshError(SELF_ORDER_VI.refreshFailed);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!snapshot.realtimeTopic) return;
    const supabase = createClient();
    const channel = supabase
      .channel(snapshot.realtimeTopic)
      .on("broadcast", { event: "session_changed" }, () => {
        void refreshSnapshot();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshSnapshot, snapshot.realtimeTopic]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot]);

  return {
    snapshot,
    setSnapshot,
    refreshSnapshot,
    isRefreshing,
    refreshError,
    clearRefreshError,
  };
}
