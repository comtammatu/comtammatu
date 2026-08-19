import { sidePortionQuantity } from "@comtammatu/shared/format";
import type { OrderItemSide } from "../types";

export { sidePortionQuantity };

const SIDE_BADGE_TONE_CLASS = "border-border/70 bg-muted/50 text-foreground";

export function formatSideLabel(side: OrderItemSide): string {
  return side.name;
}

export function getSideBadgeToneClass(_side?: OrderItemSide): string {
  return SIDE_BADGE_TONE_CLASS;
}
