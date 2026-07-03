"use client";

import { useCallback, useMemo } from "react";
import { messages } from "@lib/messages";
import { usePosDailyLimitStore } from "../_providers/pos-desktop-provider";
import {
  buildDailyLimitDemand,
  findDailyLimitBlockForProposal,
  type DailyLimitBlock,
  type ProposedDailyLimitLine,
} from "../_utils/daily-limit-draft";
import type { CartItem } from "../types";

/**
 * Add-to-cart block message for the daily-limit gate. The "exceeded" reason
 * splits copy by leg (manual quota vs stock) per D064 §6, matching the
 * server's reason codes.
 */
export function formatAddToCartBlockMessage(block: DailyLimitBlock): string {
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
  /** Per-line block check against the daily-limit quota. */
  getAddToCartBlock: (
    proposed: ProposedDailyLimitLine,
    excludeKeys?: ReadonlySet<string>,
  ) => DailyLimitBlock | null;
  /** Per-menu-item daily-limit demand across the active draft lines. */
  dailyLimitDemandByMenuItem: Map<number, number>;
}

/**
 * Owns the add-to-cart daily-limit gate for the POS desktop surface.
 * Combines the live cart snapshot and append-draft lines into a single
 * active-draft view, then exposes the per-line block check plus the
 * aggregated daily-limit demand.
 */
export function useAddToCartGate(
  args: UseAddToCartGateArgs,
): UseAddToCartGateReturn {
  const { cartItems, appendDraftItems } = args;

  const dailyLimitStore = usePosDailyLimitStore();
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
    ): DailyLimitBlock | null => {
      return findDailyLimitBlockForProposal({
        activeDraftLines,
        excludeKeys,
        proposed,
        getLimit: (menuItemId) => dailyLimitStore.get(menuItemId),
      });
    },
    [activeDraftLines, dailyLimitStore],
  );

  return { getAddToCartBlock, dailyLimitDemandByMenuItem };
}
