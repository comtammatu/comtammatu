"use client";

import { useCallback, useMemo, useState } from "react";

export type BulkSelectionId = number | string;

export interface BulkSelectableItem {
  id: BulkSelectionId;
}

export interface InventoryBulkSelection<T extends BulkSelectableItem> {
  selectedIds: Set<BulkSelectionId>;
  selectedCount: number;
  selectedItems: T[];
  isSelected: (id: BulkSelectionId) => boolean;
  toggle: (id: BulkSelectionId) => void;
  setSelected: (id: BulkSelectionId, value: boolean) => void;
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
  const [selectedIds, setSelectedIds] = useState<Set<BulkSelectionId>>(
    () => new Set(),
  );

  const isSelected = useCallback(
    (id: BulkSelectionId) => selectedIds.has(id),
    [selectedIds],
  );

  const setSelected = useCallback((id: BulkSelectionId, value: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggle = useCallback((id: BulkSelectionId) => {
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
