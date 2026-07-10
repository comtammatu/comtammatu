import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const migration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260710010833_allow_kitchen_return_transfers.sql",
  ),
  "utf8",
);

test("kitchen return migration permits only the two safe same-branch directions", () => {
  assert.match(
    migration,
    /v_from_loc\.location_kind = 'warehouse' AND v_to_loc\.location_kind = 'kitchen'/,
  );
  assert.match(
    migration,
    /v_from_loc\.location_kind = 'kitchen' AND v_to_loc\.location_kind = 'warehouse'/,
  );
  assert.match(migration, /intra_branch_same_location/);
  assert.match(migration, /intra_branch_location_invalid/);
});
