import type { MenuItemDailyLimit } from "../pos-menu-types";
import type { CartItem, CartSide } from "../types";

export type DailyLimitLookup = (
  menuItemId: number,
) => MenuItemDailyLimit | null;

type DemandLine = Pick<CartItem, "key" | "menu_item_id" | "quantity" | "sides">;

export interface ProposedDailyLimitLine {
  menuItemId: number;
  itemName: string;
  quantity: number;
  sides: readonly CartSide[];
}

export type DailyLimitBlock =
  | {
      reason: "disabled";
      itemName: string;
    }
  | {
      reason: "exceeded";
      itemName: string;
      available: number;
      requested: number;
    };

function addDemand(
  demand: Map<number, number>,
  menuItemId: number,
  quantity: number,
): void {
  demand.set(menuItemId, (demand.get(menuItemId) ?? 0) + quantity);
}

export function buildDailyLimitDemand(
  lines: readonly DemandLine[],
  options: { excludeKeys?: ReadonlySet<string> } = {},
): Map<number, number> {
  const demand = new Map<number, number>();

  for (const line of lines) {
    if (options.excludeKeys?.has(line.key)) continue;

    addDemand(demand, line.menu_item_id, line.quantity);
    for (const side of line.sides) {
      addDemand(demand, side.side_item_id, line.quantity * side.quantity);
    }
  }

  return demand;
}

/**
 * Effective daily cap = min over the NON-null values of
 * {limit_quantity, stock_capacity}. `null` when BOTH are null (unbounded).
 * `stock_capacity` is an advisory warehouse-derived cap sharing the same row
 * and the same `sold_today` counter as the manual `limit_quantity`.
 */
function effectiveDailyCap(limit: MenuItemDailyLimit): number | null {
  const stockCap = limit.stock_capacity ?? null;
  if (limit.limit_quantity == null) return stockCap;
  if (stockCap == null) return limit.limit_quantity;
  return Math.min(limit.limit_quantity, stockCap);
}

export function remainingDailyQuotaAfterDemand(
  limit: MenuItemDailyLimit | null,
  currentDraftDemand: number,
): number | null {
  if (!limit) return null;
  const cap = effectiveDailyCap(limit);
  if (cap == null) return null;
  return Math.max(0, cap - limit.sold_today - currentDraftDemand);
}

export function isDailyLimitBlockedAfterDemand(
  limit: MenuItemDailyLimit | null,
  currentDraftDemand: number,
): boolean {
  if (!limit) return false;
  if (limit.is_disabled) return true;
  const remaining = remainingDailyQuotaAfterDemand(limit, currentDraftDemand);
  return remaining !== null && remaining <= 0;
}

export function findDailyLimitBlockForProposal({
  activeDraftLines,
  excludeKeys,
  proposed,
  getLimit,
}: {
  activeDraftLines: readonly DemandLine[];
  excludeKeys?: ReadonlySet<string>;
  proposed: ProposedDailyLimitLine;
  getLimit: DailyLimitLookup;
}): DailyLimitBlock | null {
  const existingDemand = buildDailyLimitDemand(activeDraftLines, {
    excludeKeys,
  });
  const proposedDemand = new Map<
    number,
    { itemName: string; quantity: number }
  >();

  const addProposed = (
    menuItemId: number,
    itemName: string,
    quantity: number,
  ): void => {
    const current = proposedDemand.get(menuItemId);
    proposedDemand.set(menuItemId, {
      itemName: current?.itemName ?? itemName,
      quantity: (current?.quantity ?? 0) + quantity,
    });
  };

  addProposed(proposed.menuItemId, proposed.itemName, proposed.quantity);
  for (const side of proposed.sides) {
    addProposed(
      side.side_item_id,
      side.name,
      proposed.quantity * side.quantity,
    );
  }

  for (const [menuItemId, request] of proposedDemand) {
    const limit = getLimit(menuItemId);
    if (!limit) continue;

    if (limit.is_disabled) {
      return { reason: "disabled", itemName: request.itemName };
    }

    const cap = effectiveDailyCap(limit);
    if (cap == null) continue;

    const available =
      cap - limit.sold_today - (existingDemand.get(menuItemId) ?? 0);

    if (request.quantity > available) {
      return {
        reason: "exceeded",
        itemName: request.itemName,
        available: Math.max(0, available),
        requested: request.quantity,
      };
    }
  }

  return null;
}
