import { useSyncExternalStore } from "react";

// lg breakpoint (1024px) gate. Must match the Tailwind `lg:` breakpoints the
// sidebar variants use: TabbedSidebar is `md:flex lg:hidden`, SplitSidebar is
// `lg:flex`. SSR returns false so first paint renders the TabbedSidebar tree
// (correct for the md–lg tablet range); client reads the store synchronously,
// matching the `useIsMobile` SSR behavior.
const LG_BREAKPOINT = 1024;

let lgMql: MediaQueryList | null = null;

function getLgMediaQueryList(): MediaQueryList {
  lgMql ??= window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
  return lgMql;
}

function subscribeLg(onStoreChange: () => void): () => void {
  const list = getLgMediaQueryList();
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
}

function getLgSnapshot(): boolean {
  return getLgMediaQueryList().matches;
}

function getLgServerSnapshot(): boolean {
  return false;
}

export function useIsLargeUp(): boolean {
  return useSyncExternalStore(subscribeLg, getLgSnapshot, getLgServerSnapshot);
}
