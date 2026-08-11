import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/** Owner / control_surface shell cutover: touch below, dense from this width up. */
export const OWNER_SHELL_BREAKPOINT = 1024;

const mqlCache = new Map<number, MediaQueryList>();

function getMediaQueryList(breakpoint: number): MediaQueryList {
  let list = mqlCache.get(breakpoint);
  if (!list) {
    list = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    mqlCache.set(breakpoint, list);
  }
  return list;
}

// SSR renders desktop; hydration applies the real value in the same
// commit. Client-side navigations read the store synchronously, so the
// first render is already correct — the old useState(undefined)+effect
// version flashed the desktop tree on phones at every route change.
function getServerSnapshot(): boolean {
  return false;
}

// `breakpoint` defaults to the phone cutover (768). Route-specific shells may
// pass a larger value when tablet widths should stay on touch-first chrome.
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void): (() => void) => {
      const list = getMediaQueryList(breakpoint);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [breakpoint],
  );
  const getSnapshot = React.useCallback(
    (): boolean => getMediaQueryList(breakpoint).matches,
    [breakpoint],
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
