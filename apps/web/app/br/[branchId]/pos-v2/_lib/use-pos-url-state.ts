"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type PosTab = "cart" | "orders";

export interface PosUrlState {
  tab: PosTab;
  tableId: number | null;
  detailOrderId: number | null;
  appendOrderId: number | null;
}

export interface PosUrlActions {
  setTab: (tab: PosTab) => void;
  setTableId: (id: number | null) => void;
  openDetail: (orderId: number) => void;
  closeDetail: () => void;
  startAppend: (orderId: number) => void;
  clearAppend: () => void;
}

function parseNumberParam(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * URL-scoped POS state. Survives refresh/back-button and keeps the CLAUDE.md
 * "URL scope only" contract — append target and open detail sheet no longer
 * live in React state alone.
 */
export function usePosUrlState(): PosUrlState & PosUrlActions {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo<PosUrlState>(() => {
    const tabRaw = searchParams.get("tab");
    const tab: PosTab = tabRaw === "orders" ? "orders" : "cart";
    return {
      tab,
      tableId: parseNumberParam(searchParams.get("table")),
      detailOrderId: parseNumberParam(searchParams.get("detail")),
      appendOrderId: parseNumberParam(searchParams.get("append")),
    };
  }, [searchParams]);

  const push = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setTab = useCallback(
    (tab: PosTab) => {
      push((p) => {
        if (tab === "cart") p.delete("tab");
        else p.set("tab", tab);
      });
    },
    [push],
  );

  const setTableId = useCallback(
    (id: number | null) => {
      push((p) => {
        if (id == null) p.delete("table");
        else p.set("table", String(id));
      });
    },
    [push],
  );

  const openDetail = useCallback(
    (orderId: number) => {
      push((p) => {
        p.set("detail", String(orderId));
      });
    },
    [push],
  );

  const closeDetail = useCallback(() => {
    push((p) => {
      p.delete("detail");
    });
  }, [push]);

  const startAppend = useCallback(
    (orderId: number) => {
      push((p) => {
        p.set("append", String(orderId));
        p.delete("detail");
        p.delete("tab");
      });
    },
    [push],
  );

  const clearAppend = useCallback(() => {
    push((p) => {
      p.delete("append");
    });
  }, [push]);

  return {
    ...state,
    setTab,
    setTableId,
    openDetail,
    closeDetail,
    startAppend,
    clearAppend,
  };
}
