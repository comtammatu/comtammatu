import type { CartItem, CartSide } from "../types";

/**
 * Ingredient-cap draft gate — sibling to `daily-limit-draft.ts`, deliberately
 * NOT folded into it. The two model different things:
 *   - daily-limit: one limit row per menu item (per-item quota).
 *   - ingredient-cap: many dishes → one shared kitchen ingredient. A dish's
 *     `ingredient_cap` (= `max_sellable`) is a snapshot upper bound derived
 *     from the SCARCEST ingredient in its recipe; selling a coupled dish can
 *     silently lower this dish's true cap.
 *
 * Everything here is an OPTIMISTIC CLIENT SNAPSHOT. The server's order_items
 * INSERT trigger is the authoritative gate — coupled dishes sharing an
 * ingredient may still fail at submit even when this gate passes, because the
 * client cap is computed per-dish in isolation. Treat a pass here as "worth
 * trying", never as a guarantee.
 *
 * `ingredient_cap == null` means "no cap" (flag off, or dish has no recipe) →
 * never block — mirrors the daily-limit `if (!limit) continue` convention.
 */

/** Lookup of a menu item's snapshot ingredient cap; null = no cap. */
export type IngredientCapLookup = (menuItemId: number) => number | null;

type DemandLine = Pick<CartItem, "key" | "menu_item_id" | "quantity">;

export interface ProposedIngredientCapLine {
  menuItemId: number;
  itemName: string;
  quantity: number;
  sides: readonly CartSide[];
}

/**
 * Draft demand for ONE menu item across the active cart/append lines, with an
 * optional set of cart keys excluded (an in-place edit drops its own prior
 * line so it doesn't double-count). Side items are not exploded — the cap is
 * per MAIN dish (see file header), matching the migration's cap RPC.
 */
function draftDemandForMenuItem(
  lines: readonly DemandLine[],
  menuItemId: number,
  excludeKeys?: ReadonlySet<string>,
): number {
  let demand = 0;
  for (const line of lines) {
    if (excludeKeys?.has(line.key)) continue;
    if (line.menu_item_id === menuItemId) demand += line.quantity;
  }
  return demand;
}

export interface IngredientCapBlock {
  reason: "ingredient_stock";
  itemName: string;
  available: number;
  requested: number;
}

/**
 * Remaining sellable units for a dish after the draft cart's demand for THIS
 * dish is subtracted from its cap. `null` cap → `null` (no cap → no limit).
 * Never negative.
 */
export function remainingIngredientCapAfterDemand(
  ingredientCap: number | null | undefined,
  currentDraftDemand: number,
): number | null {
  if (ingredientCap == null) return null;
  return Math.max(0, ingredientCap - currentDraftDemand);
}

/**
 * True when the dish's ingredient cap is already exhausted by the draft cart
 * (cap minus this dish's draft demand <= 0). `null` cap → never blocked.
 */
export function isIngredientCapBlockedAfterDemand(
  ingredientCap: number | null | undefined,
  currentDraftDemand: number,
): boolean {
  const remaining = remainingIngredientCapAfterDemand(
    ingredientCap,
    currentDraftDemand,
  );
  return remaining !== null && remaining <= 0;
}

/**
 * Block when a proposed add would push a dish past its ingredient cap, i.e.
 * `proposedQty(item) > ingredient_cap(item) − draftQtyForThisItem`.
 *
 * Unlike the daily-limit gate, side items are NOT exploded here: the
 * migration's cap RPC explodes only the MAIN `menu_item_id` recipe (consume
 * ignores side recipes today), so the cap is per main dish. Sides on the
 * proposed line still count toward the MAIN dish's quantity via
 * `proposed.quantity`.
 *
 * `activeDraftLines` are the cart/append draft lines already present.
 * `excludeKeys` lets an in-place edit drop its own prior line.
 */
export function findIngredientCapBlockForProposal({
  activeDraftLines,
  excludeKeys,
  proposed,
  getCap,
}: {
  activeDraftLines: readonly DemandLine[];
  excludeKeys?: ReadonlySet<string>;
  proposed: ProposedIngredientCapLine;
  getCap: IngredientCapLookup;
}): IngredientCapBlock | null {
  const cap = getCap(proposed.menuItemId);
  if (cap == null) return null;

  const existingDemand = draftDemandForMenuItem(
    activeDraftLines,
    proposed.menuItemId,
    excludeKeys,
  );
  const available = cap - existingDemand;

  if (proposed.quantity > available) {
    return {
      reason: "ingredient_stock",
      itemName: proposed.itemName,
      available: Math.max(0, available),
      requested: proposed.quantity,
    };
  }

  return null;
}
