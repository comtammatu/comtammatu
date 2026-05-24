"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  KdsStation,
  OrderTypeFilter,
  TicketStatusFilter,
} from "../types";

function parseTicketStatusFilter(v: string | null): TicketStatusFilter {
  if (v === "active" || v === "pending" || v === "preparing" || v === "ready") {
    return v;
  }
  return "all";
}

function parseOrderTypeFilter(v: string | null): OrderTypeFilter {
  if (v === "dine_in" || v === "takeaway") return v;
  return "all";
}

export interface KdsFilters {
  activeStationId: number | null;
  ticketStatusFilter: TicketStatusFilter;
  orderTypeFilter: OrderTypeFilter;
  hasFilters: boolean;
  setStation: (value: string | null) => void;
  setStatus: (value: TicketStatusFilter | null) => void;
  setOrderType: (value: OrderTypeFilter | null) => void;
  clearAll: () => void;
}

export function useKdsFilters(stations: KdsStation[]): KdsFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const replaceQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const activeStationId = useMemo((): number | null => {
    const raw = searchParams.get("station");
    if (!raw || raw === "all") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return stations.some((s) => s.id === n) ? n : null;
  }, [searchParams, stations]);

  const ticketStatusFilter = useMemo(
    () => parseTicketStatusFilter(searchParams.get("status")),
    [searchParams],
  );

  const orderTypeFilter = useMemo(
    () => parseOrderTypeFilter(searchParams.get("orderType")),
    [searchParams],
  );

  const hasFilters =
    activeStationId !== null ||
    ticketStatusFilter !== "all" ||
    orderTypeFilter !== "all";

  const setStation = useCallback(
    (value: string | null) => {
      replaceQuery({ station: value === "all" ? null : value });
    },
    [replaceQuery],
  );

  const setStatus = useCallback(
    (value: TicketStatusFilter | null) => {
      replaceQuery({ status: value === null || value === "all" ? null : value });
    },
    [replaceQuery],
  );

  const setOrderType = useCallback(
    (value: OrderTypeFilter | null) => {
      replaceQuery({
        orderType: value === null || value === "all" ? null : value,
      });
    },
    [replaceQuery],
  );

  const clearAll = useCallback(() => {
    replaceQuery({ station: null, status: null, orderType: null });
  }, [replaceQuery]);

  return {
    activeStationId,
    ticketStatusFilter,
    orderTypeFilter,
    hasFilters,
    setStation,
    setStatus,
    setOrderType,
    clearAll,
  };
}
