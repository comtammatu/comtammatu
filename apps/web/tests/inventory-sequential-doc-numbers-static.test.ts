import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260728120000_inventory_sequential_doc_numbers.sql",
  ),
  "utf8",
);

test("migration defines sequential inventory document counter + allocator", () => {
  assert.match(migration, /CREATE TABLE public\.tenant_inventory_doc_counters/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.next_inventory_doc_number/,
  );
  assert.match(migration, /WHEN 'grn' THEN 'GRN'/);
  assert.match(migration, /WHEN 'transfer' THEN 'DC'/);
  assert.match(migration, /WHEN 'issue' THEN 'PXK'/);
  assert.match(migration, /WHEN 'waste' THEN 'HH'/);
  assert.match(migration, /WHEN 'production' THEN 'LSX'/);
  assert.match(migration, /WHEN 'stocktake' THEN 'KK'/);
  assert.match(migration, /WHEN 'count_slip' THEN 'PD'/);
  assert.match(migration, /session_number text/);
  assert.match(migration, /slip_number text/);
});

test("create RPCs allocate via next_inventory_doc_number", () => {
  assert.match(
    migration,
    /v_grn_number := public\.next_inventory_doc_number\(v_tenant_id, 'grn'\)/,
  );
  assert.match(
    migration,
    /v_transfer_number := public\.next_inventory_doc_number\(v_tenant, 'transfer'\)/,
  );
  assert.match(
    migration,
    /v_issue_no := public\.next_inventory_doc_number\(v_tenant, 'waste'\)/,
  );
  assert.match(
    migration,
    /v_number := public\.next_inventory_doc_number\(v_tenant, 'production'\)/,
  );
  assert.doesNotMatch(migration, /GRN-' \|\| substring\(replace\(gen_random_uuid/);
  assert.doesNotMatch(migration, /WO-' \|\| to_char/);
  assert.doesNotMatch(migration, /-COPY-/);
});

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
