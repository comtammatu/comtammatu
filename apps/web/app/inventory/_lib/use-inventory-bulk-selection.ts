"use client";

import { useCallback, useMemo, useState } from "react";

export interface BulkSelectableItem {
  id: number;
}

export interface InventoryBulkSelection<T extends BulkSelectableItem> {
  selectedIds: Set<number>;
  selectedCount: number;
  selectedItems: T[];
  isSelected: (id: number) => boolean;
  toggle: (id: number) => void;
  setSelected: (id: number, value: boolean) => void;
  selectAll: () => void;
  clear: () => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
}

/**
 * Reusable bulk-selection hook for inventory list pages.
 *
 * Generic over the item type so it can power Stock (Smart PO / Requisition),
 * Waste (bulk approve), Transfer (bulk receive), Stocktake (bulk adjust), etc.
 *
 * The hook only stores ids — the source array is passed each render so
 * `selectedItems` always reflects the latest data (filters, sorting).
 */
export function useInventoryBulkSelection<T extends BulkSelectableItem>(
  items: T[],
): InventoryBulkSelection<T> {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds],
  );

  const setSelected = useCallback((id: number, value: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isSomeSelected = selectedIds.size > 0 && !isAllSelected;

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    selectedItems,
    isSelected,
    toggle,
    setSelected,
    selectAll,
    clear,
    isAllSelected,
    isSomeSelected,
  };
}
