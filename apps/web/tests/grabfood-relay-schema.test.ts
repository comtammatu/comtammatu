import assert from "node:assert/strict";
import { test } from "node:test";
import {
  grabRelaySchema,
  summarizeGrabRelayValidationIssues,
} from "../lib/grabfood/relay-schema";

function makeExtensionPayload() {
  return {
    branch_id: 3,
    merchant_id: "5-C8DTE75GUGJ3JT",
    order: {
      orderID: "001644320651-REPRO",
      displayID: "GF-REPRO",
      orderState: "PREPARING",
      merchant: { ID: "5-C8DTE75GUGJ3JT" },
      itemInfo: {
        items: [
          {
            itemID: "VNITE20260818044418231553",
            name: "Sườn Cốt Lết",
            quantity: 1,
            comment: null,
            fare: {
              priceDisplay: "44.000",
              originalItemPriceDisplay: null,
              priceFloat: 44000,
              discountInfo: {
                discountType: "campaign",
                discountAmountFloat: 10000,
                campaignName: "Provider-added metadata",
              },
            },
            modifierGroups: [],
          },
        ],
      },
      fare: {
        subTotalDisplay: "54.000",
        totalDisplay: "44.000",
        discountDisplay: null,
      },
      paymentMethod: "platform",
      cutlery: 1,
    },
  };
}

test("Grab relay validation tolerates unknown provider metadata and nullable optional values", () => {
  const result = grabRelaySchema.safeParse(makeExtensionPayload());

  assert.equal(result.success, true);
  if (!result.success) return;

  const item = result.data.order?.itemInfo?.items[0];
  assert.equal(item?.fare?.originalItemPriceDisplay, undefined);
  assert.equal(result.data.order?.fare?.discountDisplay, undefined);
  assert.equal("campaignName" in (item?.fare?.discountInfo ?? {}), false);
});

test("Grab relay validation keeps the internal envelope strict", () => {
  const result = grabRelaySchema.safeParse({
    ...makeExtensionPayload(),
    unexpected_internal_control: true,
  });

  assert.equal(result.success, false);
});

test("Grab relay validation rejects malformed core order data", () => {
  const missingItems = makeExtensionPayload();
  missingItems.order.itemInfo.items = [];

  const invalidQuantity = makeExtensionPayload();
  invalidQuantity.order.itemInfo.items[0]!.quantity = 0;

  assert.equal(grabRelaySchema.safeParse(missingItems).success, false);
  assert.equal(grabRelaySchema.safeParse(invalidQuantity).success, false);
});

test("Grab order envelopes require an explicit branch while ping stays unscoped", () => {
  const withoutBranch = makeExtensionPayload();
  delete (withoutBranch as { branch_id?: number }).branch_id;

  assert.equal(grabRelaySchema.safeParse({ ping: true }).success, true);
  assert.equal(grabRelaySchema.safeParse(withoutBranch).success, false);
});

test("Grab relay validation diagnostics expose paths and codes without payload values", () => {
  const payload = makeExtensionPayload();
  payload.order.itemInfo.items[0]!.name = "PRIVATE CUSTOMER VALUE".repeat(20);
  const result = grabRelaySchema.safeParse(payload);

  assert.equal(result.success, false);
  if (result.success) return;

  const diagnostics = summarizeGrabRelayValidationIssues(result.error);
  assert.deepEqual(diagnostics, [
    {
      path: "order.itemInfo.items.0.name",
      code: "too_big",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE CUSTOMER VALUE/);
});
