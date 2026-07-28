import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");

test("app create paths no longer mint opaque UUID document codes", () => {
  const grn = readFileSync(
    join(root, "apps/web/app/(protected)/inventory/grn-actions.ts"),
    "utf8",
  );
  const issue = readFileSync(
    join(root, "apps/web/app/(protected)/inventory/issue-actions.ts"),
    "utf8",
  );
  const transfer = readFileSync(
    join(root, "apps/web/app/(protected)/inventory/transfer-actions.ts"),
    "utf8",
  );
  const helper = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/inventory/_lib/inventory-doc-number.ts",
    ),
    "utf8",
  );

  assert.match(helper, /next_inventory_doc_number/);
  assert.match(grn, /allocateInventoryDocNumber/);
  assert.match(issue, /allocateInventoryDocNumber/);
  assert.doesNotMatch(grn, /randomUUID/);
  assert.doesNotMatch(issue, /randomUUID/);
  assert.doesNotMatch(transfer, /randomUUID/);
  assert.doesNotMatch(transfer, /TRF-\$/);
});

test("stocktake UI uses persisted session_number; dashboard drops ST- prefix", () => {
  const dashboard = readFileSync(
    join(root, "apps/web/app/(protected)/inventory/_lib/dashboard-data.ts"),
    "utf8",
  );
  const list = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
    ),
    "utf8",
  );
  assert.doesNotMatch(dashboard, /ST-\$/);
  assert.match(dashboard, /session_number/);
  assert.match(list, /session_number/);
  assert.doesNotMatch(list, /KK-\$\{r\.id\}/);
});
