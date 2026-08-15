import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol } from "./static-source";

const source = normalizeEol(
  readFileSync(
    join(
      process.cwd(),
      "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
    ),
    "utf8",
  ),
);

const submitSuccessBlock =
  /if \(result\.success && result\.data\) \{([\s\S]*?)\n\s*\} else \{/.exec(
    source,
  )?.[1] ?? "";

test("order submit focuses order workflow without auto-opening payment dialog", () => {
  assert.match(
    submitSuccessBlock,
    /focusOrderWorkflow\(orderId, orderNumber\);/,
  );
  assert.doesNotMatch(
    submitSuccessBlock,
    /submittedOrderType === "takeaway"/,
  );
  assert.doesNotMatch(
    submitSuccessBlock,
    /setBillIntent\("payment"\);\s*setBillInitialOrder\(null\);\s*setBillOrderId\(orderId\);/,
  );
});

test("order submit provides payment quick-action in success toast instead of auto-jump", () => {
  assert.match(
    submitSuccessBlock,
    /toast\.success\([\s\S]*action:\s*\{[\s\S]*label:\s*"Thanh toán"/,
  );
});
