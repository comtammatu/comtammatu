import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");
const datedDocNumberMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260729160000_inventory_doc_numbers_with_date.sql",
  ),
  "utf8",
);

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
  assert.match(grn, /messages\.inventory\.po\.emptyLinkedGrnsHint/);
  assert.match(issue, /allocateInventoryDocNumber/);
  assert.doesNotMatch(grn, /randomUUID/);
  assert.doesNotMatch(issue, /randomUUID/);
  assert.doesNotMatch(transfer, /randomUUID/);
  assert.doesNotMatch(transfer, /TRF-\$/);
});

test("stocktake UI uses persisted session_number without synthetic ST- prefix", () => {
  const list = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
    ),
    "utf8",
  );
  assert.match(list, /session_number/);
  assert.doesNotMatch(list, /KK-\$\{r\.id\}/);
  assert.doesNotMatch(list, /ST-\$/);
});

test("new inventory and PO document codes include the VN business date", () => {
  assert.equal(
    datedDocNumberMigration.match(/'DDMMYYYY'/g)?.length,
    2,
  );
  assert.match(
    datedDocNumberMigration,
    /ON CONFLICT \(tenant_id, doc_kind, year\) DO UPDATE/,
  );
  assert.match(
    datedDocNumberMigration,
    /ON CONFLICT \(tenant_id, year\) DO UPDATE/,
  );
  assert.match(
    datedDocNumberMigration,
    /WHEN 'stock_request' THEN 'YC'/,
  );
});
