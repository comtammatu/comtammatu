import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeShopeeOrderRef,
  shopeeKitchenCallRef,
  shopeeOrderRefLookupKeys,
} from "../shopee-order-ref";

test("canonicalizeShopeeOrderRef repairs a leading OCR O in the date prefix", () => {
  assert.equal(canonicalizeShopeeOrderRef("O1096-541066134"), "01096-541066134");
  assert.equal(canonicalizeShopeeOrderRef("03096-503466798"), "03096-503466798");
  assert.equal(canonicalizeShopeeOrderRef("SPF-892"), "SPF-892");
});

test("shopeeKitchenCallRef returns the final four digits of a dated Shopee code", () => {
  assert.equal(shopeeKitchenCallRef("O1096-541066134"), "6134");
  assert.equal(shopeeKitchenCallRef("03096-503466798"), "6798");
  assert.equal(shopeeKitchenCallRef("6798"), "6798");
  assert.equal(shopeeKitchenCallRef("GF-789"), null);
});

test("shopeeOrderRefLookupKeys includes the OCR O variant of a September code", () => {
  assert.deepEqual(shopeeOrderRefLookupKeys("O1096-541066134").sort(), [
    "01096-541066134",
    "O1096-541066134",
  ]);
  assert.deepEqual(shopeeOrderRefLookupKeys("03096-503466798").sort(), [
    "03096-503466798",
    "O3096-503466798",
  ]);
});
