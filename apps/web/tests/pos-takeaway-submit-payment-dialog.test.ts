import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  ),
  "utf8",
);

const takeawaySubmitBlock =
  /if \(submittedOrderType === "takeaway"\) \{([\s\S]*?)\n\s*return;\n\s*\}/.exec(
    source,
  )?.[1] ?? "";

const dineInSubmitBlock =
  /setPostSubmitPaymentOrderId\(null\);\n\s*focusOrderWorkflow\(orderId, orderNumber\);/.exec(
    source,
  )?.[0] ?? "";

test("takeaway submit opens the payment dialog immediately after sending kitchen", () => {
  assert.match(takeawaySubmitBlock, /setBillIntent\("payment"\);/);
  assert.match(takeawaySubmitBlock, /setBillInitialOrder\(null\);/);
  assert.match(takeawaySubmitBlock, /setBillOrderId\(orderId\);/);
  assert.doesNotMatch(
    takeawaySubmitBlock,
    /setPostSubmitPaymentOrderId\(orderId\);/,
  );
  assert.doesNotMatch(takeawaySubmitBlock, /focusOrderWorkflow/);
});

test("dine-in submit still opens the order workflow instead of payment", () => {
  assert.match(
    dineInSubmitBlock,
    /focusOrderWorkflow\(orderId, orderNumber\);/,
  );
});
