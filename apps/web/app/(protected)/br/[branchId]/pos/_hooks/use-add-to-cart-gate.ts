"use client";

import { useCallback, useMemo } from "react";
import { usePosDailyLimitStore } from "../_providers/pos-desktop-provider";
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
import type { MenuItem } from "../pos-menu-types";

/**
 * Unified add-to-cart block message for both gates. Daily-limit (per-item
 * quota) and ingredient-cap (shared-stock snapshot) are separate models but
 * share the same toast surface — whichever blocks first wins.
 */
export function formatAddToCartBlockMessage(
  block: DailyLimitBlock | IngredientCapBlock,
): string {
  if (block.reason === "ingredient_stock") {
    if (block.available <= 0) {
      return `${block.itemName} đã hết nguyên liệu trong kho.`;
    }
    return `${block.itemName} chỉ còn đủ nguyên liệu cho ${block.available} phần.`;
  }

  if (block.reason === "disabled") {
    return `${block.itemName} đang tắt hôm nay.`;
  }

  if (block.available <= 0) {
    return `${block.itemName} đã hết suất hôm nay.`;
  }

  return `${block.itemName} chỉ còn ${block.available} suất.`;
}

export interface UseAddToCartGateArgs {
  /** Live cart lines (cart store snapshot items). */
  cartItems: CartItem[];
  /** Live append-draft lines. */
  appendDraftItems: CartItem[];
  /**
   * Shared menu-item lookup, owned by the orchestrator. Passed by reference so
   * its identity in `getAddToCartBlock`'s deps is unchanged across renders.
   */
  menuItemById: Map<number, MenuItem>;
}

export interface UseAddToCartGateReturn {
  /**
   * Composes BOTH add-to-cart gates: the daily-limit quota (reactive store)
   * and the ingredient-cap snapshot (static `menuItemById`). Returns whichever
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
  const { cartItems, appendDraftItems, menuItemById } = args;

  const dailyLimitStore = usePosDailyLimitStore();
  const activeDraftLines = useMemo(
    () => [...cartItems, ...appendDraftItems],
    [appendDraftItems, cartItems],
  );
  const dailyLimitDemandByMenuItem = useMemo(
    () => buildDailyLimitDemand(activeDraftLines),
    [activeDraftLines],
  );
  // Composes BOTH add-to-cart gates: the daily-limit quota (reactive store)
  // and the ingredient-cap snapshot (static `menuItemById`). Returns whichever
  // blocks first — daily-limit checked first to keep parity with prior copy.
  // Both gates are optimistic client snapshots; the server triggers are
  // authoritative (coupled dishes sharing an ingredient may still fail at
  // submit even when the cap gate passes here).
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
        getCap: (menuItemId) =>
          menuItemById.get(menuItemId)?.ingredient_cap ?? null,
      });
    },
    [activeDraftLines, dailyLimitStore, menuItemById],
  );

  return { getAddToCartBlock, dailyLimitDemandByMenuItem };
}
