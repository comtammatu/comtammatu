import * as React from "react";

const MOBILE_BREAKPOINT = 768;

let mql: MediaQueryList | null = null;

function getMediaQueryList(): MediaQueryList {
  mql ??= window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  return mql;
}

function subscribe(onStoreChange: () => void): () => void {
  const list = getMediaQueryList();
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return getMediaQueryList().matches;
}

// SSR renders desktop; hydration applies the real value in the same
// commit. Client-side navigations read the store synchronously, so the
// first render is already correct — the old useState(undefined)+effect
// version flashed the desktop tree on phones at every route change.
function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
