"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArchivedOrders } from "../actions";
import type { SessionOrder } from "../order-history";
import { usePosArchivedInvalidationToken } from "../_providers/pos-desktop-provider";

const PAGE_SIZE = 30;

type Cursor = { archivedAt: string; id: number } | null;

export type ArchivedScope = "session" | "today";

interface UseArchivedOrdersArgs {
  branchId: number;
  sessionId: number;
  /**
   * Sheet's open state. When false, the hook does NOT auto-fetch — opening
   * the sheet triggers `loadFirstPage`. This keeps the archived query off
   * the hot path until the cashier actually asks for it.
   */
  open: boolean;
  scope: ArchivedScope;
  query: string;
}

interface UseArchivedOrdersReturn {
  orders: SessionOrder[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  reload: () => void;
  loadMore: () => void;
}

/**
 * Lazy paginated lookup for the "Đã xử lý" sheet. Keyset cursor on
 * (updated_at, id). State semantics:
 *
 *   - `open=false`         → idle, no network
 *   - `open=true` (cold)   → fetch first page
 *   - cursor advances      → loadMore() appends
 *   - filters change       → reset + first page
 *   - archived token bumps → reset + first page (if open)
 *
 * Token-based invalidation (instead of pushing realtime rows into the
 * cursor stream) keeps page boundaries stable: a new payment landing on
 * terminal B mid-scroll cannot duplicate or skip rows on terminal A.
 */
export function useArchivedOrders({
  branchId,
  sessionId,
  open,
  scope,
  query,
}: UseArchivedOrdersArgs): UseArchivedOrdersReturn {
  const [orders, setOrders] = useState<SessionOrder[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Race guard: tag each fetch with a request id; ignore returns from
  // stale requests (filters changed mid-flight).
  const requestIdRef = useRef(0);
  const archivedToken = usePosArchivedInvalidationToken();

  const filterKey = `${scope}|${query.trim()}`;

  const fetchPage = useCallback(
    async (nextCursor: Cursor, isFirst: boolean) => {
      const myRequestId = ++requestIdRef.current;
      if (isFirst) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      const result = await fetchArchivedOrders({
        branchId,
        sessionId: scope === "session" ? sessionId : null,
        pageSize: PAGE_SIZE,
        cursor: nextCursor,
        q: query.trim() === "" ? undefined : query.trim(),
      });

      // Stale request — newer fetch in flight, drop result.
      if (myRequestId !== requestIdRef.current) return;

      if (result.success && result.data) {
        const rows = result.data.rows as SessionOrder[];
        setOrders((prev) => (isFirst ? rows : [...prev, ...rows]));
        setCursor(result.data.nextCursor);
        setHasMore(result.data.nextCursor !== null);
      } else {
        setError(result.error ?? "Không thể tải lịch sử đơn.");
      }

      if (isFirst) setIsLoading(false);
      else setIsLoadingMore(false);
    },
    [branchId, sessionId, scope, query],
  );

  const loadFirstPage = useCallback(() => {
    setOrders([]);
    setCursor(null);
    setHasMore(true);
    void fetchPage(null, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore || cursor === null) return;
    void fetchPage(cursor, false);
  }, [cursor, fetchPage, hasMore, isLoading, isLoadingMore]);

  // Stash latest `loadFirstPage` in a ref so the effects below can fire on
  // a curated trigger set (open / filterKey / archivedToken) without also
  // firing every time `fetchPage` rebuilds. fetchPage rebuilds on filter
  // changes, which we already track via `filterKey`; including it directly
  // would double-trigger.
  const loadFirstPageRef = useRef(loadFirstPage);
  useEffect(() => {
    loadFirstPageRef.current = loadFirstPage;
  }, [loadFirstPage]);

  // Open transition / filter change → fresh first page.
  useEffect(() => {
    if (!open) return;
    loadFirstPageRef.current();
  }, [open, filterKey]);

  // Archived invalidation token bumps when an order flips terminal. Reset
  // to first page so the new row appears at the top. Skip when sheet is
  // closed — re-open will refetch anyway.
  useEffect(() => {
    if (!open) return;
    if (archivedToken === 0) return;
    loadFirstPageRef.current();
  }, [open, archivedToken]);

  return {
    orders,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    reload: loadFirstPage,
    loadMore,
  };
}
