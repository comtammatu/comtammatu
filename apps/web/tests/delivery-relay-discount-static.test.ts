import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routeSource = readFileSync(
  new URL("../app/api/webhooks/delivery/relay/route.ts", import.meta.url),
  "utf8",
);
test("delivery relay keeps platform settlement separate from the POS sale total", () => {
  assert.doesNotMatch(routeSource, /apply_order_discount/);
  assert.doesNotMatch(routeSource, /reconcilePlatformTotal/);
  assert.match(routeSource, /marketplace commission, not a customer discount/);
});
