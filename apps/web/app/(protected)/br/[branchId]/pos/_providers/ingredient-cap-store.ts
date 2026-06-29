"use client";

export interface IngredientCapStore {
  get(id: number): number | null;
  set(id: number, value: number | null): void;
  setAll(seed: ReadonlyMap<number, number | null>): void;
  subscribe(listener: () => void): () => void;
}

function areCapsEqual(a: number | null, b: number | null): boolean {
  return (a ?? null) === (b ?? null);
}

// External store backing `useIngredientCap(itemId)`. Caps are refreshed on the
// POS limit catch-up cadence because the stock-cap RPC has no realtime channel.
export function createIngredientCapStore(
  initial: ReadonlyMap<number, number | null>,
): IngredientCapStore {
  const map = new Map<number, number>();
  const listeners = new Set<() => void>();

  for (const [id, value] of initial) {
    if (value !== null) map.set(id, value);
  }

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    get(id) {
      return map.get(id) ?? null;
    },
    set(id, value) {
      const prev = map.get(id) ?? null;
      if (areCapsEqual(prev, value)) return;
      if (value === null) map.delete(id);
      else map.set(id, value);
      notify();
    },
    setAll(seed) {
      let changed = false;
      for (const id of [...map.keys()]) {
        if (!seed.has(id) || seed.get(id) === null) {
          map.delete(id);
          changed = true;
        }
      }
      for (const [id, value] of seed) {
        const prev = map.get(id) ?? null;
        if (!areCapsEqual(prev, value)) {
          if (value === null) map.delete(id);
          else map.set(id, value);
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
