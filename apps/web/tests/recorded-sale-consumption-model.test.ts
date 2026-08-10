import assert from "node:assert/strict";
import test from "node:test";
import {
  filterSaleConsumptionOrders,
  flattenSaleConsumptionOrdersForExport,
  groupSaleConsumptionsByOrder,
  type RecordedSaleConsumptionLineInput,
} from "../lib/inventory/recorded-sale-consumption-model";

function line(
  overrides: Partial<RecordedSaleConsumptionLineInput> &
    Pick<RecordedSaleConsumptionLineInput, "id" | "orderId" | "ingredientName">,
): RecordedSaleConsumptionLineInput {
  return {
    orderNumber: `TC-${overrides.orderId}`,
    branchId: 3,
    branchName: "Chi nhánh demo",
    recordedAtIso: "2026-08-10T03:06:00.000Z",
    recordedAtLabel: "10:06 10/08/2026",
    locationName: "Kho chi nhánh",
    quantityLabel: "1 kg",
    quantityValue: 1,
    unit: "kg",
    unitCostLabel: "1.000đ/kg",
    totalCostValue: 1000,
    totalCostLabel: "1.000đ",
    sourceLabel: "Tiêu hao bán",
    ...overrides,
  };
}

test("groupSaleConsumptionsByOrder collapses ingredient lines per order", () => {
  const grouped = groupSaleConsumptionsByOrder(
    [
      line({
        id: 1,
        orderId: 11577,
        ingredientName: "Trứng",
        totalCostValue: 2000,
        recordedAtIso: "2026-08-10T03:06:00.000Z",
      }),
      line({
        id: 2,
        orderId: 11577,
        ingredientName: "Sườn",
        totalCostValue: 3000,
        recordedAtIso: "2026-08-10T03:06:01.000Z",
      }),
      line({
        id: 3,
        orderId: 11576,
        ingredientName: "Gạo",
        totalCostValue: 4000,
        recordedAtIso: "2026-08-10T03:05:00.000Z",
      }),
    ],
    { formatTotalCost: (value) => `${value}đ` },
  );

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]?.orderId, 11577);
  assert.equal(grouped[0]?.ingredientCount, 2);
  assert.equal(grouped[0]?.totalCostValue, 5000);
  assert.equal(grouped[0]?.totalCostLabel, "5000đ");
  assert.equal(grouped[0]?.recordedAtIso, "2026-08-10T03:06:01.000Z");
  assert.equal(grouped[1]?.orderId, 11576);
});

test("groupSaleConsumptionsByOrder respects orderLimit", () => {
  const grouped = groupSaleConsumptionsByOrder(
    [
      line({ id: 1, orderId: 3, ingredientName: "A" }),
      line({ id: 2, orderId: 2, ingredientName: "B" }),
      line({ id: 3, orderId: 1, ingredientName: "C" }),
    ],
    { orderLimit: 2 },
  );
  assert.deepEqual(
    grouped.map((row) => row.orderId),
    [3, 2],
  );
});

test("filterSaleConsumptionOrders matches order number and ingredient", () => {
  const grouped = groupSaleConsumptionsByOrder([
    line({ id: 1, orderId: 10, orderNumber: "TC-10", ingredientName: "Trứng" }),
    line({ id: 2, orderId: 11, orderNumber: "TC-11", ingredientName: "Gạo" }),
  ]);
  assert.equal(filterSaleConsumptionOrders(grouped, "TC-10").length, 1);
  assert.equal(filterSaleConsumptionOrders(grouped, "gao").length, 1);
  assert.equal(filterSaleConsumptionOrders(grouped, "không có").length, 0);
});

test("flattenSaleConsumptionOrdersForExport keeps one CSV row per ingredient", () => {
  const grouped = groupSaleConsumptionsByOrder([
    line({ id: 1, orderId: 10, ingredientName: "Trứng" }),
    line({ id: 2, orderId: 10, ingredientName: "Gạo" }),
  ]);
  const flat = flattenSaleConsumptionOrdersForExport(grouped);
  assert.equal(flat.length, 2);
  assert.equal(flat[0]?.line.ingredientName, "Trứng");
  assert.equal(flat[1]?.orderNumber, "TC-10");
});
