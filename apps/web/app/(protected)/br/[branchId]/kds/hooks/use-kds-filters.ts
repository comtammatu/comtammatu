"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { KdsSectionFilter, KdsStation, OrderTypeFilter } from "../types";

function parseOrderTypeFilter(v: string | null): OrderTypeFilter {
  if (v === "dine_in" || v === "takeaway") return v;
  return "all";
}

function parseSectionFilter(v: string | null): KdsSectionFilter {
  return v === "done" ? "done" : "active";
}

export interface KdsFilters {
  activeStationId: number | null;
  orderTypeFilter: OrderTypeFilter;
  sectionFilter: KdsSectionFilter;
  hasFilters: boolean;
  setStation: (value: string | null) => void;
  setOrderType: (value: OrderTypeFilter | null) => void;
  setSection: (value: KdsSectionFilter | null) => void;
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

  const orderTypeFilter = useMemo(
    () => parseOrderTypeFilter(searchParams.get("orderType")),
    [searchParams],
  );

  const sectionFilter = useMemo(
    () => parseSectionFilter(searchParams.get("section")),
    [searchParams],
  );

  const hasFilters =
    activeStationId !== null ||
    orderTypeFilter !== "all" ||
    sectionFilter !== "active";

  const setStation = useCallback(
    (value: string | null) => {
      replaceQuery({ station: value === "all" ? null : value });
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

  const setSection = useCallback(
    (value: KdsSectionFilter | null) => {
      replaceQuery({
        section: value === null || value === "active" ? null : value,
      });
    },
    [replaceQuery],
  );

  const clearAll = useCallback(() => {
    replaceQuery({
      station: null,
      status: null,
      orderType: null,
      section: null,
    });
  }, [replaceQuery]);

  return {
    activeStationId,
    orderTypeFilter,
    sectionFilter,
    hasFilters,
    setStation,
    setOrderType,
    setSection,
    clearAll,
  };
}
