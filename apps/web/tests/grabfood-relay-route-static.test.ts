import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routeSource = readFileSync(
  new URL(
    "../app/api/webhooks/grabfood/relay/route.ts",
    import.meta.url,
  ),
  "utf8",
);

function indexOfCreateOrderRpc() {
  return routeSource.search(/supabase\.rpc\(\r?\n\s*"create_order"/);
}

test("Grab relay keeps customer vouchers separate from the stored POS total", () => {
  assert.match(routeSource, /transformed\.posTotalAmount/);
  assert.match(routeSource, /transformed\.customerPayableAmount/);
  assert.doesNotMatch(routeSource, /authoritative Grab total/);
  assert.doesNotMatch(routeSource, /transformed\.totalAmount/);
});

test("Grab relay rejects incomplete free-item evidence before creating the order", () => {
  const evidenceGuard = routeSource.indexOf(
    "orderLevelFreeItemTotal > transformed.freeItemDiscountTotal",
  );
  const createCall = indexOfCreateOrderRpc();

  assert.notEqual(evidenceGuard, -1);
  assert.notEqual(createCall, -1);
  assert.ok(evidenceGuard < createCall);
  assert.match(routeSource.slice(evidenceGuard, createCall), /status:\s*422/);
});

test("Grab relay maps promotions against the configured Grab channel price", () => {
  assert.match(routeSource, /\.from\("menu_item_channel_prices"\)/);
  assert.match(routeSource, /\.eq\("delivery_platform", "grab"\)/);
  assert.match(routeSource, /channel_price: grabPriceByMenuItemId\.get\(item\.id\)/);
  assert.match(
    routeSource,
    /transformGrabOrderPayload\(grabOrder, pricedDbMenuItems\)/,
  );
});

test("Grab relay never returns a negative acknowledgement after create_order commits", () => {
  const createCall = indexOfCreateOrderRpc();
  const successResponse = routeSource.indexOf(
    "return NextResponse.json(",
    routeSource.indexOf("storedTotalAmount", createCall),
  );
  assert.notEqual(createCall, -1);
  assert.notEqual(successResponse, -1);

  const postCommitSection = routeSource.slice(createCall, successResponse);
  assert.doesNotMatch(postCommitSection, /status:\s*422/);
  assert.match(postCommitSection, /diagnostic only/);
});

test("Grab relay does not early-return create when an existing ref needs amend or cancel", () => {
  const existingLookup = routeSource.indexOf(".eq(\"external_order_ref\"");
  const decision = routeSource.indexOf("const existingDecision = resolveGrabRelayExistingDecision");
  const idempotentReturn = routeSource.indexOf("idempotent: true");

  assert.notEqual(existingLookup, -1);
  assert.notEqual(decision, -1);
  assert.ok(existingLookup < decision);
  assert.ok(decision < idempotentReturn);
  assert.match(routeSource, /kind === "amend"/);
  assert.match(routeSource, /kind === "cancel"/);
  assert.match(routeSource, /callRelayApplyGrabOrderRevision/);
  assert.match(routeSource, /callRelayCancelDeliveryOrder/);
});
