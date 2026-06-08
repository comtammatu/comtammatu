import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

test("classic stocktake completion RPC is gated by stocktake_complete permission", () => {
  // Squashed into the lean baseline; assert against the canonical baseline.
  const source = readRepoFile(
    "supabase/migrations/00000000000000_baseline.sql",
  );

  assert.match(source, /CREATE (OR REPLACE )?FUNCTION public\.complete_stocktake/);
  assert.match(
    source,
    /public\.has_permission\(v_session\.branch_id, 'inventory:stocktake_complete'\)/,
  );
  assert.match(source, /RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'/);
});
