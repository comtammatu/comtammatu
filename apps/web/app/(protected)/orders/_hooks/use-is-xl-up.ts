import { useSyncExternalStore } from "react";

// xl breakpoint (1280px) gate for the orders master-detail split pane: below
// xl, order detail opens in the OrderDetailSheet slide-over; at xl:+,
// OrdersClient renders OrderDetailContent inline in a right column instead.
// Mirrors the POS useIsLargeUp shape (use-is-large-up.ts) at the xl tier. SSR
// returns false so first paint renders the <xl (Sheet) tree; client reads the
// store synchronously.
const XL_BREAKPOINT = 1280;

let xlMql: MediaQueryList | null = null;

function getXlMediaQueryList(): MediaQueryList {
  xlMql ??= window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);
  return xlMql;
}

function subscribeXl(onStoreChange: () => void): () => void {
  const list = getXlMediaQueryList();
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
}

function getXlSnapshot(): boolean {
  return getXlMediaQueryList().matches;
}

function getXlServerSnapshot(): boolean {
  return false;
}

export function useIsXlUp(): boolean {
  return useSyncExternalStore(subscribeXl, getXlSnapshot, getXlServerSnapshot);
}
