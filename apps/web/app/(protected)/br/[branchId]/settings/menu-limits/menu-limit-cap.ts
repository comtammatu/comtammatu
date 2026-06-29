export interface MenuLimitCapFields {
  limit_quantity: number | null;
  stock_capacity: number | null;
  sold_today: number;
  is_disabled: boolean;
}

export type MenuLimitCapSource =
  | "none"
  | "manual"
  | "stock"
  | "manual_lower"
  | "stock_lower"
  | "equal";

export function hasManualMenuLimit(row: MenuLimitCapFields): boolean {
  return row.limit_quantity !== null || row.is_disabled;
}

export function getMenuLimitEffectiveCap(
  row: MenuLimitCapFields,
): number | null {
  const manualCap = row.limit_quantity;
  const stockCap = row.stock_capacity;

  if (manualCap === null) return stockCap;
  if (stockCap === null) return manualCap;
  return Math.min(manualCap, stockCap);
}

export function getMenuLimitRemaining(row: MenuLimitCapFields): number | null {
  const cap = getMenuLimitEffectiveCap(row);
  if (cap === null) return null;
  return Math.max(0, cap - row.sold_today);
}

export function getMenuLimitCapSource(
  row: MenuLimitCapFields,
): MenuLimitCapSource {
  const manualCap = row.limit_quantity;
  const stockCap = row.stock_capacity;

  if (manualCap === null && stockCap === null) return "none";
  if (manualCap === null) return "stock";
  if (stockCap === null) return "manual";
  if (manualCap < stockCap) return "manual_lower";
  if (stockCap < manualCap) return "stock_lower";
  return "equal";
}
