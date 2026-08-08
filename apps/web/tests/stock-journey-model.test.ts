import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getBranchStockRequestProgress,
  getStockJourney,
} from "../lib/inventory/stock-journey-model";

test("stock journey stops at the earliest unfinished stage", () => {
  assert.deepEqual(
    getStockJourney({
      requestStatus: "submitted",
      items: [{ status: "pending" }, { status: "allocated" }],
      transfers: [{ status: "received" }],
    }),
    {
      stage: "preparation",
      outcome: null,
      nextAction: "prepare",
      receivedTransfers: 1,
      activeTransfers: 1,
    },
  );
});

test("stock journey covers draft, dispatch, transit, and receipt", () => {
  const cases = [
    {
      requestStatus: "draft",
      items: [{ status: "pending" }],
      transfers: [],
      stage: "request",
      nextAction: "edit",
    },
    {
      requestStatus: "submitted",
      items: [{ status: "allocated" }],
      transfers: [{ status: "draft" }],
      stage: "preparation",
      nextAction: "ship",
    },
    {
      requestStatus: "submitted",
      items: [{ status: "allocated" }],
      transfers: [{ status: "in_transit" }],
      stage: "in_transit",
      nextAction: "receive",
    },
    {
      requestStatus: "submitted",
      items: [{ status: "allocated" }],
      transfers: [{ status: "confirmed_receive" }],
      stage: "in_transit",
      nextAction: "receive",
    },
    {
      requestStatus: "submitted",
      items: [{ status: "allocated" }],
      transfers: [{ status: "received" }],
      stage: "received",
      nextAction: "none",
    },
  ] as const;

  for (const item of cases) {
    const result = getStockJourney(item);
    assert.equal(result.stage, item.stage);
    assert.equal(result.nextAction, item.nextAction);
  }
});

test("stock journey keeps exceptions separate from progress", () => {
  assert.equal(
    getStockJourney({
      requestStatus: "submitted",
      items: [{ status: "rejected" }],
      transfers: [],
    }).outcome,
    "rejected",
  );
  const closedWithCompletedTransfer = getStockJourney({
    requestStatus: "closed",
    items: [{ status: "cancelled" }, { status: "allocated" }],
    transfers: [{ status: "received" }],
  });
  assert.equal(closedWithCompletedTransfer.stage, "received");
  assert.equal(closedWithCompletedTransfer.outcome, "closed");
  assert.equal(
    getStockJourney({
      requestStatus: "closed",
      items: [{ status: "rejected" }, { status: "allocated" }],
      transfers: [{ status: "received" }],
    }).outcome,
    "rejected",
  );
  assert.equal(
    getStockJourney({
      requestStatus: "submitted",
      items: [{ status: "allocated" }],
      transfers: [
        {
          status: "received",
          lines: [{ quantity: 10, quantityReceived: 8 }],
        },
      ],
    }).outcome,
    "short_received",
  );
});

test("cancelled transfers do not inflate delivery progress", () => {
  const result = getStockJourney({
    requestStatus: "submitted",
    items: [{ status: "pending" }],
    transfers: [{ status: "cancelled" }],
  });

  assert.equal(result.activeTransfers, 0);
  assert.equal(result.receivedTransfers, 0);
  assert.equal(result.stage, "preparation");
});

test("branch YCH progress is submit → approved → shipping → confirm", () => {
  assert.equal(
    getBranchStockRequestProgress({
      requestStatus: "draft",
      items: [{ status: "pending" }],
      transfers: [],
    }).currentStep,
    "submit",
  );
  assert.equal(
    getBranchStockRequestProgress({
      requestStatus: "submitted",
      items: [{ status: "pending" }],
      transfers: [],
    }).currentStep,
    "approved",
  );
  assert.equal(
    getBranchStockRequestProgress({
      requestStatus: "submitted",
      items: [{ status: "allocated" }],
      transfers: [{ id: 1, status: "draft" }],
    }).currentStep,
    "shipping",
  );
  const receiveReady = getBranchStockRequestProgress({
    requestStatus: "submitted",
    items: [{ status: "allocated" }],
    transfers: [{ id: 9, status: "in_transit" }],
  });
  assert.equal(receiveReady.currentStep, "confirm");
  assert.equal(receiveReady.canConfirm, true);
  assert.equal(receiveReady.firstReceiveTransferId, 9);
  assert.equal(
    getBranchStockRequestProgress({
      requestStatus: "fulfilled",
      items: [{ status: "allocated" }],
      transfers: [{ id: 9, status: "received" }],
    }).allDone,
    true,
  );
});
