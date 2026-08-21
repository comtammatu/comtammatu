import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePosMenuListPrice } from "../app/(protected)/br/[branchId]/pos/_lib/delivery-channel";

const item = {
  base_price: 45000,
  channel_prices: {
    grab: 56000,
    shopee: 56000,
  },
};

const sideItem = {
  base_price: 8000,
  channel_prices: {
    grab: 12000,
    shopee: 12000,
  },
};

test("dine_in and takeaway always use base_price", () => {
  assert.deepEqual(resolvePosMenuListPrice(item, "dine_in", null), {
    ok: true,
    unitPrice: 45000,
  });
  assert.deepEqual(resolvePosMenuListPrice(item, "takeaway", "grab"), {
    ok: true,
    unitPrice: 45000,
  });
});

test("delivery uses channel price and fails loud when missing", () => {
  assert.deepEqual(resolvePosMenuListPrice(item, "delivery", "grab"), {
    ok: true,
    unitPrice: 56000,
  });
  assert.deepEqual(resolvePosMenuListPrice(item, "delivery", null), {
    ok: false,
    reason: "platform_required",
  });
  assert.deepEqual(resolvePosMenuListPrice(item, "delivery", "be"), {
    ok: false,
    reason: "channel_price_missing",
  });
});

test("delivery sides use the same channel list-price helper as mains", () => {
  assert.deepEqual(resolvePosMenuListPrice(sideItem, "dine_in", null), {
    ok: true,
    unitPrice: 8000,
  });
  assert.deepEqual(resolvePosMenuListPrice(sideItem, "takeaway", "grab"), {
    ok: true,
    unitPrice: 8000,
  });
  assert.deepEqual(resolvePosMenuListPrice(sideItem, "delivery", "grab"), {
    ok: true,
    unitPrice: 12000,
  });
  assert.notEqual(
    resolvePosMenuListPrice(sideItem, "delivery", "grab").ok
      ? resolvePosMenuListPrice(sideItem, "delivery", "grab").unitPrice
      : null,
    sideItem.base_price,
  );
  assert.deepEqual(resolvePosMenuListPrice(sideItem, "delivery", "be"), {
    ok: false,
    reason: "channel_price_missing",
  });
});
