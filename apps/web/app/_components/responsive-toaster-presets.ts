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
const OPERATIONAL_TOAST_ROUTE_PATTERN = /^\/br\/[^/]+\/(?:pos|kds)(?:\/|$)/;

/** Public QR self-order guest routes — high-contrast dark toast, larger type. */
const GUEST_TOAST_ROUTE_PATTERN = /^\/q(?:\/|$)/;

const TOAST_CLASS_NAMES = {
  toast: "cn-toast",
  closeButton: "cn-toast-close",
};

const GUEST_TOAST_CLASS_NAMES = {
  toast: "cn-toast cn-toast-guest",
  title: "cn-toast-guest-title",
  description: "cn-toast-guest-description",
  closeButton: "cn-toast-close",
  actionButton: "cn-toast-guest-action",
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
 * - `closeButton` — tap X to dismiss without swiping.
 * - `visibleToasts: 1` + `expand: false` — operational surfaces never let
 *   stacked feedback cover the next cashier / kitchen action.
 * - Short default `duration` — routine feedback clears quickly; callers can
 *   still opt into longer warning/error toasts when the next step needs it.
 * - `offset` + `mobileOffset` — tablets don't fall back to Sonner's desktop offset.
 */
export const COMPACT_TOAST_PRESET = {
  richColors: true,
  position: "top-center",
  visibleToasts: 1,
  closeButton: true,
  expand: false,
  duration: 1800,
  gap: 4,
  offset: COMPACT_TOAST_OFFSET,
  mobileOffset: COMPACT_TOAST_OFFSET,
  swipeDirections: ["top", "right", "left"],
  containerAriaLabel: "Thông báo thao tác",
  toastOptions: {
    closeButtonAriaLabel: "Đóng thông báo",
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
  containerAriaLabel: "Thông báo thao tác",
  toastOptions: {
    closeButtonAriaLabel: "Đóng thông báo",
  },
} satisfies ToasterPreset;

/**
 * Guest self-order preset — `/q/*` on any viewport:
 * - `theme: "dark"` so richColors warning/error use dark surfaces + bright
 *   text (light Sonner warning is ~97% yellow-white and disappears on the
 *   cream guest menu).
 * - Larger title/description via `.cn-toast-guest*` (Sonner default is 13px).
 * - Compact stack + close button like the operational preset.
 */
export const GUEST_TOAST_PRESET = {
  ...COMPACT_TOAST_PRESET,
  theme: "dark",
  duration: 5_000,
  containerAriaLabel: "Thông báo khách",
  toastOptions: {
    closeButtonAriaLabel: "Đóng thông báo",
    classNames: GUEST_TOAST_CLASS_NAMES,
  },
} satisfies ToasterPreset;

export function isOperationalToastRoute(pathname: string | null): boolean {
  return pathname !== null && OPERATIONAL_TOAST_ROUTE_PATTERN.test(pathname);
}

export function isGuestToastRoute(pathname: string | null): boolean {
  return pathname !== null && GUEST_TOAST_ROUTE_PATTERN.test(pathname);
}

/**
 * Pure preset selection: guest `/q/*` → high-contrast guest toaster; mobile
 * (whole app) or a POS/KDS route (any viewport) → the compact operational
 * toaster; everything else → the desktop preset.
 * Exported for unit testing without rendering the client component.
 */
export function selectToasterPreset({
  isMobile,
  pathname,
}: {
  isMobile: boolean;
  pathname: string | null;
}): ToasterPreset {
  if (isGuestToastRoute(pathname)) return GUEST_TOAST_PRESET;
  return isMobile || isOperationalToastRoute(pathname)
    ? COMPACT_TOAST_PRESET
    : DESKTOP_TOAST_PRESET;
}
