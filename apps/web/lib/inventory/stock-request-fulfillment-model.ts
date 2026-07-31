export type StockRequestFulfillLine = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unitLabel: string;
  /** `ingredient_units.to_base_factor` for the request entry unit; 0 when unresolved. */
  toBaseFactor: number;
  fulfillSiteKind: "central_supply" | "central_kitchen";
  status: string;
};

export type StockRequestFulfillGroup = {
  fulfillSiteKind: "central_supply" | "central_kitchen";
  fromBranchId: number;
  locations: Array<{ id: number; label: string }>;
  /** locationId → ingredientId → on-hand in base units */
  stockByLocation: Record<number, Record<number, number>>;
  lines: StockRequestFulfillLine[];
};

/** Convert stock_levels base qty into the request entry unit. */
export function onHandInEntryUnit(
  onHandBase: number,
  toBaseFactor: number,
): number {
  if (!(toBaseFactor > 0)) return onHandBase;
  return onHandBase / toBaseFactor;
}

export function lineOnHandInEntryUnit(
  line: Pick<StockRequestFulfillLine, "ingredientId" | "toBaseFactor">,
  locationId: number | null | undefined,
  stockByLocation: Record<number, Record<number, number>>,
): number {
  if (locationId == null || !Number.isFinite(locationId) || locationId <= 0) {
    return 0;
  }
  const onHandBase = stockByLocation[locationId]?.[line.ingredientId] ?? 0;
  return onHandInEntryUnit(onHandBase, line.toBaseFactor);
}

export function isFulfillLineShort(
  line: Pick<
    StockRequestFulfillLine,
    "quantity" | "ingredientId" | "toBaseFactor" | "status"
  >,
  locationId: number | null | undefined,
  stockByLocation: Record<number, Record<number, number>>,
): boolean {
  if (line.status !== "pending") return false;
  const onHand = lineOnHandInEntryUnit(line, locationId, stockByLocation);
  return onHand + 1e-9 < line.quantity;
}
