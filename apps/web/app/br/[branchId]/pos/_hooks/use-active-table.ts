"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePosTables } from "../_providers/pos-desktop-provider";
import type { BranchTable } from "../page";

type UseActiveTableResult = {
  tableId: number | null;
  table: BranchTable | null;
  isAvailable: boolean;
  setTable: (id: number | null) => void;
};

function parseTableId(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

/**
 * URL persists the selected table across reloads.
 * Local state keeps POS interaction instant without App Router navigation.
 */
export function useActiveTable(): UseActiveTableResult {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tables = usePosTables();
  const [tableId, setTableId] = useState<number | null>(() =>
    parseTableId(searchParams.get("table")),
  );

  useEffect(() => {
    setTableId(parseTableId(searchParams.get("table")));
  }, [searchParams]);

  useEffect(() => {
    const syncFromLocation = () => {
      setTableId(
        parseTableId(new URLSearchParams(window.location.search).get("table")),
      );
    };
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const table = useMemo(() => {
    if (tableId == null) return null;
    return tables.find((t) => t.id === tableId) ?? null;
  }, [tableId, tables]);

  const isAvailable = table?.status === "available";

  const setTable = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(window.location.search);
      if (id != null) params.set("table", String(id));
      else params.delete("table");
      const q = params.toString();
      const nextUrl = `${pathname}${q ? `?${q}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", nextUrl);
      setTableId(id);
    },
    [pathname],
  );

  return useMemo(
    () => ({ tableId, table, isAvailable, setTable }),
    [tableId, table, isAvailable, setTable],
  );
}
