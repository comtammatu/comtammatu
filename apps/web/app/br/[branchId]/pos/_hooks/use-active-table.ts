"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePosOperationalData } from "../_providers/pos-desktop-provider";
import type { BranchTable } from "../page";

type UseActiveTableResult = {
  tableId: number | null;
  table: BranchTable | null;
  isAvailable: boolean;
  setTable: (id: number | null) => void;
};

/**
 * URL is the single source of truth for the selected table.
 * Reads ?table=X and derives validity against current table list.
 */
export function useActiveTable(): UseActiveTableResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { tables } = usePosOperationalData();

  const tableId = useMemo(() => {
    const raw = searchParams.get("table");
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.trunc(parsed);
  }, [searchParams]);

  const table = useMemo(() => {
    if (tableId == null) return null;
    return tables.find((t) => t.id === tableId) ?? null;
  }, [tableId, tables]);

  const isAvailable = table?.status === "available";

  const setTable = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id != null) params.set("table", String(id));
      else params.delete("table");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { tableId, table, isAvailable, setTable };
}
