import { matchesSearch } from "@lib/search";

export const RECORDED_SALE_CONSUMPTION_ORDER_LIMIT = 50;
export const RECORDED_SALE_CONSUMPTION_MOVEMENT_FETCH_LIMIT = 500;

export type RecordedSaleConsumptionLineInput = {
  id: number;
  orderId: number;
  orderNumber: string | null;
  branchId: number;
  branchName: string;
  recordedAtIso: string;
  recordedAtLabel: string;
  locationName: string;
  ingredientName: string;
  quantityLabel: string;
  quantityValue: number;
  unit: string;
  unitCostLabel: string | null;
  totalCostValue: number;
  totalCostLabel: string | null;
  sourceLabel: string;
};

export type RecordedSaleConsumptionLine = {
  id: number;
  ingredientName: string;
  locationName: string;
  quantityLabel: string;
  quantityValue: number;
  unit: string;
  unitCostLabel: string | null;
  totalCostLabel: string | null;
  totalCostValue: number;
};

export type RecordedSaleConsumptionOrder = {
  orderId: number;
  orderNumber: string;
  branchId: number;
  branchName: string;
  recordedAtIso: string;
  recordedAtLabel: string;
  locationName: string;
  ingredientCount: number;
  sourceLabel: string;
  lines: RecordedSaleConsumptionLine[];
  totalCostValue: number;
  totalCostLabel: string | null;
};

function compareIsoDesc(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

/**
 * Collapse POS sale_consumption ingredient movements into one row per order.
 * Input must already be newest-first; order rows keep that relative order.
 */
export function groupSaleConsumptionsByOrder(
  lines: RecordedSaleConsumptionLineInput[],
  options?: {
    orderLimit?: number | null;
    formatTotalCost?: (value: number) => string;
  },
): RecordedSaleConsumptionOrder[] {
  const orderLimit = options?.orderLimit;
  const formatTotalCost = options?.formatTotalCost;
  const byOrder = new Map<number, RecordedSaleConsumptionOrder>();
  const orderIds: number[] = [];

  for (const line of lines) {
    const existing = byOrder.get(line.orderId);
    const nextLine: RecordedSaleConsumptionLine = {
      id: line.id,
      ingredientName: line.ingredientName,
      locationName: line.locationName,
      quantityLabel: line.quantityLabel,
      quantityValue: line.quantityValue,
      unit: line.unit,
      unitCostLabel: line.unitCostLabel,
      totalCostLabel: line.totalCostLabel,
      totalCostValue: line.totalCostValue,
    };

    if (!existing) {
      const totalCostValue = line.totalCostValue;
      byOrder.set(line.orderId, {
        orderId: line.orderId,
        orderNumber: line.orderNumber?.trim() || String(line.orderId),
        branchId: line.branchId,
        branchName: line.branchName,
        recordedAtIso: line.recordedAtIso,
        recordedAtLabel: line.recordedAtLabel,
        locationName: line.locationName,
        ingredientCount: 1,
        sourceLabel: line.sourceLabel,
        lines: [nextLine],
        totalCostValue,
        totalCostLabel: formatTotalCost
          ? formatTotalCost(totalCostValue)
          : line.totalCostLabel,
      });
      orderIds.push(line.orderId);
      continue;
    }

    existing.lines.push(nextLine);
    existing.ingredientCount = existing.lines.length;
    existing.totalCostValue += line.totalCostValue;
    existing.totalCostLabel = formatTotalCost
      ? formatTotalCost(existing.totalCostValue)
      : existing.totalCostLabel;
    if (compareIsoDesc(line.recordedAtIso, existing.recordedAtIso) < 0) {
      // Keep the newest movement timestamp as the order card time.
      existing.recordedAtIso = line.recordedAtIso;
      existing.recordedAtLabel = line.recordedAtLabel;
    }
    if (
      existing.locationName !== line.locationName &&
      line.locationName !== "—"
    ) {
      // Mixed locations stay as the first non-empty label; detail lists each line.
    }
  }

  const grouped = orderIds
    .map((orderId) => byOrder.get(orderId))
    .filter((row): row is RecordedSaleConsumptionOrder => row != null)
    .toSorted((left, right) =>
      compareIsoDesc(left.recordedAtIso, right.recordedAtIso),
    );

  if (orderLimit == null || orderLimit <= 0) return grouped;
  return grouped.slice(0, orderLimit);
}

export function filterSaleConsumptionOrders(
  rows: RecordedSaleConsumptionOrder[],
  query: string,
): RecordedSaleConsumptionOrder[] {
  const normalized = query.trim();
  if (!normalized) return rows;
  return rows.filter((row) =>
    matchesSearch(
      [
        row.orderNumber,
        String(row.orderId),
        row.branchName,
        row.locationName,
        row.sourceLabel,
        ...row.lines.map((line) => line.ingredientName),
      ],
      normalized,
    ),
  );
}

export function flattenSaleConsumptionOrdersForExport(
  rows: RecordedSaleConsumptionOrder[],
): Array<RecordedSaleConsumptionOrder & { line: RecordedSaleConsumptionLine }> {
  return rows.flatMap((row) => row.lines.map((line) => ({ ...row, line })));
}
