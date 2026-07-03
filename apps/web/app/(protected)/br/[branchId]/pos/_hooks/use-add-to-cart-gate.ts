"use client";

import { useCallback, useMemo } from "react";
import { messages } from "@lib/messages";
import {
  usePosDailyLimitStore,
  usePosIngredientCapStore,
} from "../_providers/pos-desktop-provider";
import {
  buildDailyLimitDemand,
  findDailyLimitBlockForProposal,
  type DailyLimitBlock,
  type ProposedDailyLimitLine,
} from "../_utils/daily-limit-draft";
import {
  findIngredientCapBlockForProposal,
  type IngredientCapBlock,
} from "../_utils/ingredient-cap-draft";
import type { CartItem } from "../types";

/**
 * Unified add-to-cart block message for both gates. Daily-limit (per-item
 * quota) and ingredient-cap (shared-stock snapshot) are separate models but
 * share the same toast surface — whichever blocks first wins. The daily-limit
 * "exceeded" reason further splits copy by leg (manual quota vs stock) per
 * D064 §6, matching the server's reason codes.
 */
export function formatAddToCartBlockMessage(
  block: DailyLimitBlock | IngredientCapBlock,
): string {
  if (block.reason === "ingredient_stock") {
    return block.available <= 0
      ? messages.pos.menu.blockedStockExhausted(block.itemName)
      : messages.pos.menu.blockedStockLow(block.itemName, block.available);
  }

  if (block.reason === "disabled") {
    return messages.pos.menu.blockedDisabled(block.itemName);
  }

  if (block.stockLeg) {
    return block.available <= 0
      ? messages.pos.menu.blockedStockExhausted(block.itemName)
      : messages.pos.menu.blockedStockLow(block.itemName, block.available);
  }

  return block.available <= 0
    ? messages.pos.menu.blockedManualExhausted(block.itemName)
    : messages.pos.menu.blockedManualLow(block.itemName, block.available);
}

export interface UseAddToCartGateArgs {
  /** Live cart lines (cart store snapshot items). */
  cartItems: CartItem[];
  /** Live append-draft lines. */
  appendDraftItems: CartItem[];
}

export interface UseAddToCartGateReturn {
  /**
   * Composes BOTH add-to-cart gates: the daily-limit quota and the ingredient
   * cap. Returns whichever
   * blocks first — daily-limit checked first to keep parity with prior copy.
   * Both gates are optimistic client snapshots; the server triggers are
   * authoritative (coupled dishes sharing an ingredient may still fail at
   * submit even when the cap gate passes here).
   */
  getAddToCartBlock: (
    proposed: ProposedDailyLimitLine,
    excludeKeys?: ReadonlySet<string>,
  ) => DailyLimitBlock | IngredientCapBlock | null;
  /** Per-menu-item daily-limit demand across the active draft lines. */
  dailyLimitDemandByMenuItem: Map<number, number>;
}

/**
 * Owns the add-to-cart daily-limit / ingredient-cap gate for the POS desktop
 * surface. Combines the live cart snapshot and append-draft lines into a single
 * active-draft view, then exposes the per-line block check plus the aggregated
 * daily-limit demand.
 */
export function useAddToCartGate(
  args: UseAddToCartGateArgs,
): UseAddToCartGateReturn {
  const { cartItems, appendDraftItems } = args;

  const dailyLimitStore = usePosDailyLimitStore();
  const ingredientCapStore = usePosIngredientCapStore();
  const activeDraftLines = useMemo(
    () => [...cartItems, ...appendDraftItems],
    [appendDraftItems, cartItems],
  );
  const dailyLimitDemandByMenuItem = useMemo(
    () => buildDailyLimitDemand(activeDraftLines),
    [activeDraftLines],
  );
  const getAddToCartBlock = useCallback(
    (
      proposed: ProposedDailyLimitLine,
      excludeKeys?: ReadonlySet<string>,
    ): DailyLimitBlock | IngredientCapBlock | null => {
      const dailyBlock = findDailyLimitBlockForProposal({
        activeDraftLines,
        excludeKeys,
        proposed,
        getLimit: (menuItemId) => dailyLimitStore.get(menuItemId),
      });
      if (dailyBlock) return dailyBlock;

      return findIngredientCapBlockForProposal({
        activeDraftLines,
        excludeKeys,
        proposed,
        getCap: (menuItemId) => ingredientCapStore.get(menuItemId),
      });
    },
    [activeDraftLines, dailyLimitStore, ingredientCapStore],
  );

  return { getAddToCartBlock, dailyLimitDemandByMenuItem };
}
