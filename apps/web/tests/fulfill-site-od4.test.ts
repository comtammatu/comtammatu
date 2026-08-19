import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exclusiveFulfillSiteKind,
  hasAllowedFulfillSite,
  preferPullFromSite,
  resolveFulfillSiteFlags,
} from "../lib/inventory/fulfill-site";

test("OD-4 both allowed with on-hand at both prefills Kho Tổng", () => {
  assert.equal(
    preferPullFromSite({
      allowSupply: true,
      allowKitchen: true,
      supplyOnHand: 4,
      kitchenOnHand: 9,
    }),
    "central_supply",
  );
});

test("OD-4 Kho Tổng ticked at qty 0 and Bếp has qty prefills Bếp TT", () => {
  assert.equal(
    preferPullFromSite({
      allowSupply: true,
      allowKitchen: true,
      supplyOnHand: 0,
      kitchenOnHand: 3,
    }),
    "central_kitchen",
  );
});

test("OD-4 single ticked site is the prefill", () => {
  assert.equal(
    preferPullFromSite({
      allowSupply: false,
      allowKitchen: true,
      supplyOnHand: 10,
      kitchenOnHand: 0,
    }),
    "central_kitchen",
  );
  assert.equal(
    preferPullFromSite({
      allowSupply: true,
      allowKitchen: false,
      supplyOnHand: 0,
      kitchenOnHand: 8,
    }),
    "central_supply",
  );
});

test("neither Nguồn hàng tick is missing, not a silent default", () => {
  assert.equal(
    preferPullFromSite({
      allowSupply: false,
      allowKitchen: false,
      supplyOnHand: 5,
      kitchenOnHand: 5,
    }),
    null,
  );
  assert.equal(
    hasAllowedFulfillSite({
      fulfillFromCentralSupply: false,
      fulfillFromCentralKitchen: false,
    }),
    false,
  );
});

test("both flags keep exclusive leftover as Kho Tổng", () => {
  assert.equal(
    exclusiveFulfillSiteKind({
      fulfillFromCentralSupply: true,
      fulfillFromCentralKitchen: true,
    }),
    "central_supply",
  );
  assert.deepEqual(
    resolveFulfillSiteFlags({
      fulfillFromCentralSupply: true,
      fulfillFromCentralKitchen: true,
      defaultFulfillSiteKind: "central_kitchen",
    }),
    {
      fulfillFromCentralSupply: true,
      fulfillFromCentralKitchen: true,
    },
  );
});
