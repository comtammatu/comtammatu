"use client";

import type { MenuItemDailyLimit } from "../pos-menu-types";

export interface DailyLimitStore {
  get(id: number): MenuItemDailyLimit | null;
  setAll(seed: ReadonlyMap<number, MenuItemDailyLimit>): void;
  subscribe(listener: () => void): () => void;
}

function areLimitsEqual(
  a: MenuItemDailyLimit | null,
  b: MenuItemDailyLimit | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.is_disabled === b.is_disabled &&
    a.sold_today === b.sold_today &&
    a.manual_limit_quantity === b.manual_limit_quantity &&
    a.available_to_sell === b.available_to_sell
  );
}

// External store backing `useDailyLimit(itemId)` — per-id selector
// subscription so a single realtime tick on item X re-renders only the
// MenuItemButton for X (vs invalidating the whole 50–200 card grid via
// React context propagation). Owner: PosDesktopProvider.
export function createDailyLimitStore(
  initial: ReadonlyMap<number, MenuItemDailyLimit>,
): DailyLimitStore {
  const map = new Map<number, MenuItemDailyLimit>(initial);
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    get(id) {
      return map.get(id) ?? null;
    },
    setAll(seed) {
      let changed = false;
      for (const id of [...map.keys()]) {
        if (!seed.has(id)) {
          map.delete(id);
          changed = true;
        }
      }
      for (const [id, value] of seed) {
        const prev = map.get(id) ?? null;
        if (!areLimitsEqual(prev, value)) {
          map.set(id, value);
          changed = true;
        }
      }
      if (changed) notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
