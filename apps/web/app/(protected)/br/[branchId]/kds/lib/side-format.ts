import type { OrderItemSide } from "../types";

type QuantityValue = number | null | undefined;

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
