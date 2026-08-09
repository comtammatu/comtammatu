import { isPositiveUnitCost } from "@/(protected)/inventory/_lib/menu-recipe-cost";

/** Stock / GRN ops labels — never treat zero/null cost as free. */
export type StockValuationDisplayKind = "valued" | "pending" | "empty";

export type GrnValuationDisplayKind = "pending_invoice" | "settled" | null;

export { isPositiveUnitCost };

/**
 * On-hand valuation label: qty with no positive WAC means awaiting invoice
 * settlement, not a free item.
 */
export function resolveStockValuationDisplay({
  quantity,
  unitCost,
}: {
  quantity: number;
  unitCost: number | null | undefined;
}): StockValuationDisplayKind {
  if (isPositiveUnitCost(unitCost)) return "valued";
  if (Number.isFinite(quantity) && quantity > 0) return "pending";
  return "empty";
}

/**
 * Confirmed GRN may have quantity before supplier invoice settles WAC.
 * Prefer explicit `cost_pending` when present; otherwise no invoice ⇒ pending.
 */
export function resolveGrnValuationDisplay({
  status,
  invoiceId,
  hasCostPendingLines,
}: {
  status: string;
  invoiceId: number | null | undefined;
  hasCostPendingLines?: boolean | null;
}): GrnValuationDisplayKind {
  if (status !== "confirmed") return null;
  if (hasCostPendingLines === true) return "pending_invoice";
  if (invoiceId == null) return "pending_invoice";
  if (hasCostPendingLines === false) return "settled";
  return "settled";
}

export function grnHasCostPendingLines(
  lines: readonly { costPending?: boolean | null }[],
): boolean {
  return lines.some((line) => line.costPending === true);
}
