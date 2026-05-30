"use client";

import { MenuLimitsSheet } from "../../menu-limits/menu-limits-sheet";
import type { KdsMenuLimitRow } from "../types";

interface KdsMenuLimitsSheetProps {
  branchId: number;
  rows: KdsMenuLimitRow[];
  onRowsChange: (rows: KdsMenuLimitRow[]) => void;
  compact?: boolean;
}

export function KdsMenuLimitsSheet({
  branchId,
  rows,
  onRowsChange,
  compact = false,
}: KdsMenuLimitsSheetProps) {
  return (
    <MenuLimitsSheet
      branchId={branchId}
      rows={rows}
      onRowsChange={onRowsChange}
      compact={compact}
    />
  );
}
