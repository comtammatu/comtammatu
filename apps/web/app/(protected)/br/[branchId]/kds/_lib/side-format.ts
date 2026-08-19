import { sidePortionQuantity } from "@comtammatu/shared/format";
import type { OrderItemSide } from "../types";

export { sidePortionQuantity };

const SIDE_BADGE_TONE_CLASSES = [
  "border-chart-1/40 bg-chart-1/15",
  "border-chart-2/40 bg-chart-2/15",
  "border-chart-3/40 bg-chart-3/15",
  "border-chart-4/40 bg-chart-4/15",
  "border-chart-5/40 bg-chart-5/15",
] as const;

export function formatSideLabel(side: OrderItemSide): string {
  return side.name;
}

export function getSideBadgeToneClass(side: OrderItemSide): string {
  const seed = Math.trunc(side.side_item_id) - 1;
  const index = positiveModulo(seed, SIDE_BADGE_TONE_CLASSES.length);

  return SIDE_BADGE_TONE_CLASSES[index] ?? "border-chart-1/40 bg-chart-1/15";
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
