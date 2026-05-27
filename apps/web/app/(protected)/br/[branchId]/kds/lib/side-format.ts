import type { OrderItemSide } from "../types";

type QuantityValue = number | null | undefined;

const SIDE_BADGE_TONE_CLASSES = [
  "border-chart-1/60 bg-chart-1/25",
  "border-chart-2/60 bg-chart-2/25",
  "border-chart-3/60 bg-chart-3/25",
  "border-chart-4/60 bg-chart-4/25",
  "border-chart-5/60 bg-chart-5/25",
] as const;

const ORANGE_SIDE_BADGE_TONE_CLASS =
  "border-warning/70 bg-warning/35 text-warning-foreground";

function positiveQuantity(value: QuantityValue, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function sidePortionQuantity(
  sideQuantity: QuantityValue,
): number {
  return positiveQuantity(sideQuantity, 1);
}

export function formatSideLabel(side: OrderItemSide): string {
  return `${side.name} x${sidePortionQuantity(side.quantity)}`;
}

export function getSideBadgeToneClass(side: OrderItemSide): string {
  if (isOrangeSideDish(side.name)) return ORANGE_SIDE_BADGE_TONE_CLASS;

  const seed = Math.trunc(side.side_item_id) - 1;
  const index = positiveModulo(seed, SIDE_BADGE_TONE_CLASSES.length);

  return SIDE_BADGE_TONE_CLASSES[index] ?? SIDE_BADGE_TONE_CLASSES[0];
}

function isOrangeSideDish(name: string): boolean {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return normalized === "cha" || normalized.startsWith("cha ");
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
