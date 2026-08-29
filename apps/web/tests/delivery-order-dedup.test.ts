import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyLegacyOrderCandidates,
  deriveShopeeLegacyLookup,
} from "../lib/shopeefood/legacy-order-dedup";

const incomingItems = [
  { menu_item_id: 101, item_name: "Cơm tấm sườn", quantity: 2 },
  { menu_item_id: 202, item_name: "Trứng ốp la", quantity: 1 },
];

const relayRouteSource = readFileSync(
  new URL("../app/api/webhooks/delivery/relay/route.ts", import.meta.url),
  "utf8",
);

test("derives the legacy Shopee short reference and Vietnam order-day window", () => {
  assert.deepEqual(
    deriveShopeeLegacyLookup(
      "29086-503463626",
      new Date("2026-08-29T12:17:00.000Z"),
    ),
    {
      shortRef: "3626",
      startIso: "2026-08-28T17:00:00.000Z",
      endIso: "2026-08-29T17:00:00.000Z",
    },
  );
});

test("rejects malformed, impossible, and stale Shopee references", () => {
  const now = new Date("2026-08-29T12:17:00.000Z");

  assert.equal(deriveShopeeLegacyLookup("SPF-892", now), null);
  assert.equal(deriveShopeeLegacyLookup("32086-503463626", now), null);
  assert.equal(deriveShopeeLegacyLookup("01016-503463626", now), null);
});

test("matches one manual order with the same core items and ignores packaging", () => {
  assert.deepEqual(
    classifyLegacyOrderCandidates(incomingItems, [
      {
        orderId: 91,
        items: [
          ...incomingItems,
          {
            menu_item_id: 303,
            item_name: "Dụng Cụ Mang Về",
            quantity: 3,
          },
        ],
      },
    ]),
    { status: "matched", orderId: 91 },
  );
});

test("quarantines a short-reference collision when item quantities differ", () => {
  assert.deepEqual(
    classifyLegacyOrderCandidates(incomingItems, [
      {
        orderId: 92,
        items: [
          { menu_item_id: 101, item_name: "Cơm tấm sườn", quantity: 1 },
          { menu_item_id: 202, item_name: "Trứng ốp la", quantity: 1 },
        ],
      },
    ]),
    { status: "ambiguous" },
  );
});

test("quarantines multiple orders sharing the same short reference", () => {
  assert.deepEqual(
    classifyLegacyOrderCandidates(incomingItems, [
      { orderId: 93, items: incomingItems },
      { orderId: 94, items: incomingItems },
    ]),
    { status: "ambiguous" },
  );
});

test("allows creation when no legacy short-reference order exists", () => {
  assert.deepEqual(classifyLegacyOrderCandidates(incomingItems, []), {
    status: "none",
  });
});

test("stores and returns the four-digit Shopee reference on POS", () => {
  assert.match(relayRouteSource, /const posDisplayRef = legacyLookup\?\.shortRef \?\? displayRef/);
  assert.match(relayRouteSource, /p_external_order_ref: posDisplayRef/);
  assert.equal(
    relayRouteSource.match(/display_id: posDisplayRef/g)?.length,
    3,
  );
  assert.doesNotMatch(relayRouteSource, /display_id: displayRef/);
});
