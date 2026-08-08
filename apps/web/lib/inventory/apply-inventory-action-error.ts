/**
 * Client-side helper: turn an inventory ActionResult failure into toast copy
 * plus optional line targeting for quantity/stock errors.
 */

import { INVENTORY_ERROR_CODES } from "@lib/messages/inventory-rpc-errors";

export type InventoryLineErrorTarget = {
  ingredientId: number;
  lineId?: number;
  field?: string;
};

export type AppliedInventoryActionError = {
  toastMessage: string;
  lineTarget: InventoryLineErrorTarget | null;
  errorCode?: string;
};

function readPositiveInt(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

/**
 * Normalize a failed inventory ActionResult for UI.
 * Line targeting applies when `errorCode === insufficient_stock` and
 * `meta.ingredientId` is present (fulfill / transfer / waste / issue).
 */
export function applyInventoryActionError(
  result: {
    error?: string | null;
    errorCode?: string;
    meta?: Record<string, unknown>;
  },
  fallbackMessage: string,
): AppliedInventoryActionError {
  const ingredientId = readPositiveInt(result.meta?.ingredientId);
  const lineId = readPositiveInt(result.meta?.lineId);
  const field =
    typeof result.meta?.field === "string" ? result.meta.field : undefined;

  const lineTarget =
    result.errorCode === INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK &&
    ingredientId != null
      ? {
          ingredientId,
          ...(lineId != null ? { lineId } : {}),
          ...(field != null ? { field } : {}),
        }
      : null;

  const message =
    typeof result.error === "string" ? result.error.trim() : "";

  return {
    toastMessage: message || fallbackMessage,
    lineTarget,
    errorCode: result.errorCode,
  };
}

/** Resolve a display name for toast when the server omitted it. */
export function inventoryShortageToastMessage(
  applied: AppliedInventoryActionError,
  ingredientName: string | null | undefined,
  namedFallback: (name: string) => string,
): string {
  if (applied.lineTarget != null && ingredientName?.trim()) {
    return namedFallback(ingredientName.trim());
  }
  return applied.toastMessage;
}
