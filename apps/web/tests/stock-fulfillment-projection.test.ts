import assert from "node:assert/strict";
import { test } from "node:test";
import {
  projectStockFulfillmentRows,
  type StockFulfillmentRequestItemRecord,
  type StockFulfillmentRequestRecord,
  type StockFulfillmentTransferRecord,
} from "../lib/inventory/stock-fulfillment-projection";

const supply = { id: 1, name: "Kho Tổng", kind: "central_supply" as const };
const kitchen = { id: 2, name: "Bếp TT", kind: "central_kitchen" as const };
const branch = { id: 3, name: "Chi nhánh A", kind: "branch" as const };
const request: StockFulfillmentRequestRecord = {
  id: 10,
  requestNumber: "YCH-10",
  status: "submitted",
  requesterSite: branch,
  neededAt: "2026-07-31",
  createdAt: "2026-07-30T10:00:00Z",
};
const items: StockFulfillmentRequestItemRecord[] = [
  {
    id: 101,
    requestId: 10,
    status: "allocated",
    fulfillSiteKind: "central_supply",
    transferId: 201,
  },
  {
    id: 102,
    requestId: 10,
    status: "allocated",
    fulfillSiteKind: "central_kitchen",
    transferId: 202,
  },
];
const transfers: StockFulfillmentTransferRecord[] = [
  {
    id: 201,
    transferNumber: "DC-201",
    status: "draft",
    stockRequestId: 10,
    fromSite: supply,
    toSite: branch,
    createdAt: "2026-07-30T10:01:00Z",
    lines: [{ quantity: 1, quantityReceived: null }],
  },
  {
    id: 202,
    transferNumber: "DC-202",
    status: "in_transit",
    stockRequestId: 10,
    fromSite: kitchen,
    toSite: branch,
    createdAt: "2026-07-30T10:02:00Z",
    lines: [{ quantity: 1, quantityReceived: null }],
  },
  {
    id: 203,
    transferNumber: "DC-203",
    status: "draft",
    stockRequestId: null,
    fromSite: supply,
    toSite: kitchen,
    createdAt: "2026-07-30T10:03:00Z",
    lines: [{ quantity: 1, quantityReceived: null }],
  },
];

test("one request projects to one row with two source lanes", () => {
  const rows = projectStockFulfillmentRows({
    requests: [request],
    items,
    transfers,
    viewer: { mode: "central", branchId: null },
  });

  assert.equal(rows.length, 2);
  const requestRow = rows.find((row) => row.kind === "request");
  assert.ok(requestRow);
  assert.deepEqual(
    requestRow.sources.map((source) => source.siteKind),
    ["central_supply", "central_kitchen"],
  );
  assert.deepEqual(requestRow.workKinds, ["dispatch", "receive"]);
  assert.equal(rows.filter((row) => row.kind === "manual_transfer").length, 1);
});

test("central kitchen sees its own supply request and kitchen-sourced branch work", () => {
  const ownRequest: StockFulfillmentRequestRecord = {
    ...request,
    id: 11,
    requestNumber: "YCH-11",
    requesterSite: kitchen,
  };
  const ownItem: StockFulfillmentRequestItemRecord = {
    id: 103,
    requestId: 11,
    status: "pending",
    fulfillSiteKind: "central_supply",
    transferId: null,
  };
  const rows = projectStockFulfillmentRows({
    requests: [request, ownRequest],
    items: [...items, ownItem],
    transfers,
    viewer: {
      mode: "central",
      branchId: kitchen.id,
      fulfillSiteKind: "central_kitchen",
    },
  });

  assert.deepEqual(
    rows
      .filter((row) => row.kind === "request")
      .map((row) => row.documentNumber)
      .sort(),
    ["YCH-10", "YCH-11"],
  );
  const ownRow = rows.find(
    (row) => row.kind === "request" && row.requestId === 11,
  );
  assert.ok(ownRow);
  assert.deepEqual(
    ownRow.sources.map((source) => source.siteKind),
    ["central_supply"],
  );
});

test("owner site scope keeps the whole two-source journey", () => {
  const rows = projectStockFulfillmentRows({
    requests: [request],
    items,
    transfers,
    viewer: {
      mode: "central",
      branchId: supply.id,
      scopeSiteKind: "central_supply",
      fulfillSiteKind: "central_supply",
      seeAllSources: true,
    },
  });

  const requestRow = rows.find((row) => row.kind === "request");
  assert.ok(requestRow);
  assert.deepEqual(
    requestRow.sources.map((source) => source.siteKind),
    ["central_supply", "central_kitchen"],
  );
});

test("linked transfers never become independent rows", () => {
  const rows = projectStockFulfillmentRows({
    requests: [],
    items: [],
    transfers,
    viewer: { mode: "central", branchId: null },
  });

  assert.deepEqual(
    rows.map((row) => row.kind === "manual_transfer" && row.transferId),
    [203],
  );
});
