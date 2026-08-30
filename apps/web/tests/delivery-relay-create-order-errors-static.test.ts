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

test("Má Tư Agent blocks terminal relay failures instead of auto-retrying", () => {
  assert.match(dispatcher, /RelayTerminalException/);
  assert.match(dispatcher, /markOrderBlocked/);
  assert.match(queueHelper, /STATUS_BLOCKED/);
});
