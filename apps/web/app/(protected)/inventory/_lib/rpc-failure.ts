/**
 * Inventory RPC failure helpers.
 *
 * Compose shared `mapRpcError` with line-targeting for stock shortages
 * (`insufficient_stock:<id>` and related sentinels). Never return raw
 * Postgres/Supabase messages to the client.
 */

import type { ActionResult } from "@comtammatu/shared/types";
import {
  mapRpcError,
  type RpcErrorFallback,
  type RpcErrorLike,
  type RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import { INVENTORY_ERROR_CODES } from "@lib/messages/inventory-rpc-errors";

const INSUFFICIENT_STOCK_PATTERNS: readonly RegExp[] = [
  /insufficient_stock_ingredient:(\d+)/i,
  /insufficient_source_stock:(\d+)/i,
  /insufficient_stock_for_(\d+)/i,
  /insufficient_stock(?::|_)(\d+)/i,
];

export type InventoryLineFailureMeta = {
  ingredientId: number;
  lineId?: number;
  field?: "quantity";
};

/**
 * Parse ingredient id from inventory shortage sentinels.
 * Supports: `insufficient_stock:12`, `insufficient_stock_12`,
 * `insufficient_stock_for_12`, `insufficient_stock_ingredient:12`,
 * `insufficient_source_stock:12`.
 */
export function parseInsufficientStockIngredientId(
  message: string | null | undefined,
): number | null {
  const raw = message ?? "";
  for (const pattern of INSUFFICIENT_STOCK_PATTERNS) {
    const match = pattern.exec(raw);
    if (!match?.[1]) continue;
    const ingredientId = Number(match[1]);
    if (Number.isInteger(ingredientId) && ingredientId > 0) {
      return ingredientId;
    }
  }
  return null;
}

export function insufficientStockFailure<T = never>(
  ingredientId: number,
  options?: {
    ingredientName?: string | null;
    lineId?: number;
    message?: string;
  },
): ActionResult<T> {
  const name = options?.ingredientName?.trim();
  return {
    success: false,
    error:
      options?.message ??
      (name
        ? `Tồn kho không đủ: ${name}.`
        : "Số lượng vượt tồn hiện tại."),
    errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
    meta: {
      ingredientId,
      field: "quantity",
      ...(options?.lineId != null ? { lineId: options.lineId } : {}),
    } satisfies InventoryLineFailureMeta,
  };
}

/**
 * Map an inventory RPC error. When the message embeds an ingredient id,
 * attach `meta.ingredientId` so clients can highlight the failing line.
 */
export function mapInventoryRpcFailure<T = never>(
  error: RpcErrorLike,
  mappings: readonly RpcErrorMapping[],
  fallback: RpcErrorFallback,
  options?: {
    ingredientNameById?: ReadonlyMap<number, string>;
    lineId?: number;
  },
): ActionResult<T> {
  const ingredientId = parseInsufficientStockIngredientId(error.message);
  if (ingredientId != null) {
    const name = options?.ingredientNameById?.get(ingredientId) ?? null;
    const mapped = mapRpcError<T>(error, mappings, fallback);
    return {
      success: false,
      error:
        name != null && name.trim() !== ""
          ? `Tồn kho không đủ: ${name}.`
          : (mapped.error ?? fallback.userMessage),
      errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
      meta: {
        ingredientId,
        field: "quantity",
        ...(options?.lineId != null ? { lineId: options.lineId } : {}),
      } satisfies InventoryLineFailureMeta,
    };
  }

  return mapRpcError<T>(error, mappings, fallback);
}
