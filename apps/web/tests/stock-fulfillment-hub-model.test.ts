import assert from "node:assert/strict";
import { test } from "node:test";
import type { StockFulfillmentRow } from "../lib/inventory/stock-fulfillment-data";
import {
  filterStockFulfillmentRows,
  stockFulfillmentBranchProgressLines,
  stockFulfillmentReceiveTransferId,
  stockFulfillmentRowHref,
  summarizeBranchStockWork,
} from "../lib/inventory/stock-fulfillment-hub-model";

const branchSite = { id: 3, name: "Chi nhánh A", kind: "branch" as const };
const supplySite = {
  id: 1,
  name: "Kho Tổng",
  kind: "central_supply" as const,
};

test("preferWork receive routes request to first receive-ready transfer", () => {
  const row: StockFulfillmentRow = {
    kind: "request",
    requestId: 10,
    documentNumber: "YCH-10",
    requesterSite: branchSite,
    createdAt: "2026-08-01T00:00:00Z",
    neededAt: null,
    status: "submitted",
    lifecycle: "active",
    workKinds: ["receive"],
    sources: [
      {
        siteKind: "central_supply",
        itemCount: 1,
        pendingItemCount: 0,
        stage: "in_transit",
        outcome: null,
        receivedTransfers: 0,
        activeTransfers: 1,
        transfers: [
          { id: 201, documentNumber: "DC-201", status: "draft" },
          { id: 202, documentNumber: "DC-202", status: "confirmed_ship" },
        ],
      },
    ],
    currentWork: ["Kiểm nhận hàng"],
    lineCount: 1,
  };

  assert.equal(
    stockFulfillmentRowHref(row, 3, { preferWork: "receive" }),
    "/br/3/stock/receive/202",
  );
  // Default opens YCH detail — receive pad only when preferWork=receive.
  assert.equal(stockFulfillmentRowHref(row, 3), "/br/3/stock/requests/10");
});

test("request without receive-ready transfer keeps request detail href", () => {
  const row: StockFulfillmentRow = {
    kind: "request",
    requestId: 11,
    documentNumber: "YCH-11",
    requesterSite: branchSite,
    createdAt: "2026-08-01T00:00:00Z",
    neededAt: null,
    status: "submitted",
    lifecycle: "active",
    workKinds: ["request"],
    sources: [
      {
        siteKind: "central_supply",
        itemCount: 1,
        pendingItemCount: 1,
        stage: "preparation",
        outcome: null,
        receivedTransfers: 0,
        activeTransfers: 0,
        transfers: [],
      },
    ],
    currentWork: ["Theo dõi yêu cầu"],
    lineCount: 1,
  };

  assert.equal(
    stockFulfillmentRowHref(row, 3, { preferWork: "receive" }),
    "/br/3/stock/requests/11",
  );
  assert.equal(stockFulfillmentReceiveTransferId(row), null);
});

test("summarizeBranchStockWork counts YCH and inbound receive-ready manual DC", () => {
  const rows: StockFulfillmentRow[] = [
    {
      kind: "request",
      requestId: 10,
      documentNumber: "YCH-10",
      requesterSite: branchSite,
      createdAt: "2026-08-01T00:00:00Z",
      neededAt: null,
      status: "submitted",
      lifecycle: "active",
      workKinds: ["receive"],
      sources: [
        {
          siteKind: "central_supply",
          itemCount: 1,
          pendingItemCount: 0,
          stage: "in_transit",
          outcome: null,
          receivedTransfers: 0,
          activeTransfers: 1,
          transfers: [
            { id: 90, documentNumber: "DC-90", status: "in_transit" },
          ],
        },
      ],
      currentWork: ["Kiểm nhận hàng"],
      lineCount: 1,
    },
    {
      kind: "manual_transfer",
      transferId: 91,
      documentNumber: "DC-91",
      fromSite: supplySite,
      toSite: branchSite,
      createdAt: "2026-08-01T01:00:00Z",
      status: "draft",
      transferScope: "inter_site",
      lifecycle: "active",
      workKinds: ["dispatch"],
      currentWork: ["Chuẩn bị và giao hàng"],
      lineCount: 1,
    },
    {
      kind: "manual_transfer",
      transferId: 92,
      documentNumber: "DC-92",
      fromSite: supplySite,
      toSite: branchSite,
      createdAt: "2026-08-01T02:00:00Z",
      status: "in_transit",
      transferScope: "inter_site",
      lifecycle: "active",
      workKinds: ["receive"],
      currentWork: ["Kiểm nhận hàng"],
      lineCount: 2,
    },
  ];

  assert.deepEqual(summarizeBranchStockWork(rows), {
    receiveReadyCount: 2,
    openRequestCount: 1,
    activeJourneyCount: 3,
    firstReceiveTransferId: 90,
  });
});

test("branch progress lines show inbound manual DC receive status", () => {
  const row: StockFulfillmentRow = {
    kind: "manual_transfer",
    transferId: 92,
    documentNumber: "DC-92",
    fromSite: supplySite,
    toSite: branchSite,
    createdAt: "2026-08-01T02:00:00Z",
    status: "in_transit",
    transferScope: "inter_site",
    lifecycle: "active",
    workKinds: ["receive"],
    currentWork: ["Kiểm nhận hàng"],
    lineCount: 2,
  };

  assert.deepEqual(stockFulfillmentBranchProgressLines(row), ["Đang giao"]);
});

test("branch search omits linked DC document numbers", () => {
  const row: StockFulfillmentRow = {
    kind: "request",
    requestId: 10,
    documentNumber: "YCH-10",
    requesterSite: branchSite,
    createdAt: "2026-08-01T00:00:00Z",
    neededAt: null,
    status: "submitted",
    lifecycle: "active",
    workKinds: ["receive"],
    sources: [
      {
        siteKind: "central_supply",
        itemCount: 1,
        pendingItemCount: 0,
        stage: "in_transit",
        outcome: null,
        receivedTransfers: 0,
        activeTransfers: 1,
        transfers: [{ id: 90, documentNumber: "DC-90", status: "in_transit" }],
      },
    ],
    currentWork: ["Kiểm nhận hàng"],
    lineCount: 1,
  };

  const withDcSearch = filterStockFulfillmentRows([row], {
    work: "all",
    state: "all",
    search: "DC-90",
    matchesSearch: (values, query) =>
      values.some((value) => value.toLowerCase().includes(query.toLowerCase())),
  });
  assert.equal(withDcSearch.length, 1);

  const branchSearch = filterStockFulfillmentRows([row], {
    work: "all",
    state: "all",
    search: "DC-90",
    omitLinkedTransferSearch: true,
    matchesSearch: (values, query) =>
      values.some((value) => value.toLowerCase().includes(query.toLowerCase())),
  });
  assert.equal(branchSearch.length, 0);

  const ychSearch = filterStockFulfillmentRows([row], {
    work: "all",
    state: "all",
    search: "YCH-10",
    omitLinkedTransferSearch: true,
    matchesSearch: (values, query) =>
      values.some((value) => value.toLowerCase().includes(query.toLowerCase())),
  });
  assert.equal(ychSearch.length, 1);
});

test("branch progress lines hide central source and DC prep", () => {
  const row: StockFulfillmentRow = {
    kind: "request",
    requestId: 11,
    documentNumber: "YCH-11",
    requesterSite: branchSite,
    createdAt: "2026-08-01T00:00:00Z",
    neededAt: null,
    status: "submitted",
    lifecycle: "active",
    workKinds: ["request"],
    sources: [
      {
        siteKind: "central_supply",
        itemCount: 1,
        pendingItemCount: 1,
        stage: "preparation",
        outcome: null,
        receivedTransfers: 0,
        activeTransfers: 0,
        transfers: [],
      },
    ],
    currentWork: ["Theo dõi yêu cầu"],
    lineCount: 1,
  };

  assert.deepEqual(stockFulfillmentBranchProgressLines(row), [
    "2/4 · Đã duyệt",
  ]);
  assert.doesNotMatch(
    stockFulfillmentBranchProgressLines(row).join(" "),
    /Kho Tổng|Chuẩn bị|DC/,
  );
});
