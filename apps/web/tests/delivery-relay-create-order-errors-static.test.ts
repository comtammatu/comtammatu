import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const grabRoute = readFileSync(
  new URL("../app/api/webhooks/grabfood/relay/route.ts", import.meta.url),
  "utf8",
);
const deliveryRoute = readFileSync(
  new URL("../app/api/webhooks/delivery/relay/route.ts", import.meta.url),
  "utf8",
);
const dispatcher = readFileSync(
  new URL(
    "../../../tools/matu-agent/app/src/main/java/com/comtammatu/relay/WebhookDispatcher.kt",
    import.meta.url,
  ),
  "utf8",
);
const queueHelper = readFileSync(
  new URL(
    "../../../tools/matu-agent/app/src/main/java/com/comtammatu/relay/OrderQueueDbHelper.kt",
    import.meta.url,
  ),
  "utf8",
);

test("relay routes return mapped create-order failures", () => {
  assert.match(grabRoute, /mapRelayCreateOrderRpcError/);
  assert.match(deliveryRoute, /mapRelayCreateOrderRpcError/);
});

test("delivery relay quarantines unmapped menu items as operator-actionable failures", () => {
  assert.match(deliveryRoute, /UnmappedDeliveryMenuItemError/);
  assert.match(deliveryRoute, /\.from\("menu_item_variants"\)/);
  assert.match(grabRoute, /\.from\("menu_item_variants"\)/);
  assert.match(deliveryRoute, /code:\s*"menu_item_unmapped"/);
  assert.match(deliveryRoute, /status:\s*422/);
});

test("Má Tư Agent blocks terminal relay failures instead of auto-retrying", () => {
  assert.match(dispatcher, /RelayTerminalException/);
  assert.match(dispatcher, /markOrderBlocked/);
  assert.match(queueHelper, /STATUS_BLOCKED/);
});
