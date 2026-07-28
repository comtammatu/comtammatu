/**
 * Shared Positioner defaults for portaled overlays used in LIST toolbars.
 * Card/`overflow-hidden` ancestors must not drive flip into the search row.
 */
export const FLOATING_POSITION_METHOD = "fixed" as const;

export function floatingCollisionBoundary():
  | "clipping-ancestors"
  | HTMLElement {
  return typeof document === "undefined"
    ? "clipping-ancestors"
    : document.documentElement;
}
