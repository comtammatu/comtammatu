import type { ToasterProps } from "@comtammatu/ui/components/sonner";

/**
 * Pure (no-`"use client"`, no runtime imports) preset logic for
 * {@link ResponsiveToaster}. Split out from `responsive-toaster.tsx` so it can
 * be unit-tested by behavior without importing the client component (and its
 * `sonner` / `next/navigation` / `use-mobile` runtime deps) into `node:test`.
 *
 * The `sonner` import is type-only — erased at runtime, so this module loads
 * with zero external dependencies.
 */

/** Props bundle handed to the Sonner `<Toaster>`. */
export type ToasterPreset = ToasterProps;

/** POS/KDS branch routes (any viewport) get the compact operational toaster. */
export const OPERATIONAL_TOAST_ROUTE_PATTERN =
  /^\/br\/[^/]+\/(?:pos|kds)(?:\/|$)/;

const TOAST_CLASS_NAMES = {
  toast: "cn-toast",
};

const COMPACT_TOAST_OFFSET = {
  top: "calc(env(safe-area-inset-top) + 0.5rem)",
  left: "0.5rem",
  right: "0.5rem",
};

/**
 * Compact preset — mobile (whole app) and POS/KDS (any viewport):
 * - `top-center` — avoids notch / Dynamic Island, doesn't cover a bottom FAB,
 *   sits near thumb-reach for tap-action / swipe-dismiss.
 * - `closeButton` — tap ✕ to dismiss without swiping.
 * - `visibleToasts: 3` + `expand: false` — tight stack for POS/KDS on
 *   phone/tablet, not the desktop-PC assumption.
 * - `offset` + `mobileOffset` — tablets don't fall back to Sonner's desktop offset.
 */
export const COMPACT_TOAST_PRESET = {
  richColors: true,
  position: "top-center",
  visibleToasts: 3,
  closeButton: true,
  expand: false,
  gap: 8,
  offset: COMPACT_TOAST_OFFSET,
  mobileOffset: COMPACT_TOAST_OFFSET,
  containerAriaLabel: "Thông báo thao tác",
  toastOptions: {
    classNames: TOAST_CLASS_NAMES,
  },
} satisfies ToasterPreset;

/**
 * Desktop preset — non-operational desktop routes: `top-right`, `expand` on
 * hover, 5 toasts at once.
 */
export const DESKTOP_TOAST_PRESET = {
  richColors: true,
  position: "top-right",
  visibleToasts: 5,
  expand: true,
} satisfies ToasterPreset;

export function isOperationalToastRoute(pathname: string | null): boolean {
  return pathname !== null && OPERATIONAL_TOAST_ROUTE_PATTERN.test(pathname);
}

/**
 * Pure preset selection: mobile (whole app) or a POS/KDS route (any viewport)
 * → the compact operational toaster; everything else → the desktop preset.
 * Exported for unit testing without rendering the client component.
 */
export function selectToasterPreset({
  isMobile,
  pathname,
}: {
  isMobile: boolean;
  pathname: string | null;
}): ToasterPreset {
  return isMobile || isOperationalToastRoute(pathname)
    ? COMPACT_TOAST_PRESET
    : DESKTOP_TOAST_PRESET;
}
