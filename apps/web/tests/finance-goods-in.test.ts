import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isConfirmedSupplierInvoiceGoodsIn,
  isPeriodGoodsInAllocation,
  periodGoodsInKindForLocation,
  sumConfirmedSupplierInvoiceSubtotals,
  sumPeriodGoodsIn,
  type PeriodGoodsInAllocation,
} from "../app/(protected)/finance/_lib/finance-goods-in";

const transferIn: PeriodGoodsInAllocation = {
  allocatedValue: 42_600_000,
  allocationBucket: "inventory",
  eventType: "transfer_in",
  branchId: 3,
  grnId: null,
};

const zeroTransferIn: PeriodGoodsInAllocation = {
  allocatedValue: 0,
  allocationBucket: "inventory",
  eventType: "transfer_in",
  branchId: 3,
  grnId: null,
};

const invoiceReprice: PeriodGoodsInAllocation = {
  allocatedValue: 10_000_000,
  allocationBucket: "inventory",
  eventType: "invoice_reprice",
  branchId: 1,
  grnId: null,
};

const posShortfall: PeriodGoodsInAllocation = {
  allocatedValue: 21_000_000,
  allocationBucket: "inventory",
  eventType: "receipt",
  branchId: 3,
  grnId: null,
};

test("branch scope costs received transfer_in and ignores purchases and shortfall", () => {
  assert.equal(periodGoodsInKindForLocation("branch"), "inbound_transfer");
  assert.equal(periodGoodsInKindForLocation("branches"), "inbound_transfer");
  const nht = new Set([3]);
  assert.equal(
    sumPeriodGoodsIn(
      [transferIn, zeroTransferIn, invoiceReprice, posShortfall],
      "inbound_transfer",
      nht,
    ),
    42_600_000,
  );
  assert.equal(
    isPeriodGoodsInAllocation(posShortfall, "inbound_transfer", nht),
    false,
  );
  assert.equal(
    isPeriodGoodsInAllocation(invoiceReprice, "inbound_transfer", nht),
    false,
  );
});

test("company scope costs confirmed input invoices, including unpaid", () => {
  assert.equal(periodGoodsInKindForLocation("all"), "inventory_purchase");
  assert.equal(periodGoodsInKindForLocation("company"), "inventory_purchase");
  assert.equal(isConfirmedSupplierInvoiceGoodsIn("draft"), false);
  assert.equal(isConfirmedSupplierInvoiceGoodsIn("confirmed"), true);
  assert.equal(isConfirmedSupplierInvoiceGoodsIn("adjusted"), true);
  assert.equal(
    sumConfirmedSupplierInvoiceSubtotals([
      { documentStatus: "confirmed", subtotal: 94_544_381 },
      { documentStatus: "unpaid", subtotal: 1 },
      { documentStatus: "confirmed", subtotal: 60_550_912 },
      { documentStatus: "draft", subtotal: 18_092_000 },
    ]),
    155_095_293,
  );
  assert.equal(
    isPeriodGoodsInAllocation(transferIn, "inventory_purchase", null),
    false,
  );
});
