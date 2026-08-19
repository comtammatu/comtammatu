"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readDevicePref, writeDevicePref } from "@lib/device-prefs";
import type { KdsStation } from "../types";

export interface KdsFilters {
  activeStationId: number | null;
  hasFilters: boolean;
  setStation: (value: string | null) => void;
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

  // A kitchen tablet is pinned to its station; standalone PWA launches at
  // the bare start_url, so the station pick used to reset every relaunch.
  // URL stays SSOT — the device pref only seeds it once when absent.
  const stationPrefKey = `kds:station:${pathname}`;
  const stationRestoredRef = useRef(false);
  useEffect(() => {
    if (stationRestoredRef.current) return;
    stationRestoredRef.current = true;
    if (searchParams.get("station") !== null) return;
    const saved = readDevicePref(stationPrefKey);
    if (saved === null || saved === "all") return;
    const n = Number(saved);
    if (!Number.isFinite(n) || !stations.some((s) => s.id === n)) return;
    replaceQuery({ station: saved });
  }, [replaceQuery, searchParams, stationPrefKey, stations]);

  const hasFilters = activeStationId !== null;

  const setStation = useCallback(
    (value: string | null) => {
      writeDevicePref(stationPrefKey, value ?? "all");
      replaceQuery({ station: value === "all" ? null : value });
    },
    [replaceQuery, stationPrefKey],
  );

  const clearAll = useCallback(() => {
    writeDevicePref(stationPrefKey, "all");
    replaceQuery({ station: null, status: null, orderType: null });
  }, [replaceQuery, stationPrefKey]);

  return {
    activeStationId,
    hasFilters,
    setStation,
    clearAll,
  };
}
