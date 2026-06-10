import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  const candidate = new URL(path, repoRoot);
  if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  if (path.startsWith("supabase/migrations/")) {
    return readFileSync(
      new URL(
        path.replace("supabase/migrations/", "supabase/migrations/_archive/"),
        repoRoot,
      ),
      "utf8",
    );
  }
  return readFileSync(candidate, "utf8");
}

test("classic stocktake completion RPC is gated by stocktake_complete permission", () => {
  const source = readRepoFile(
    "supabase/migrations/20260524010000_stocktake_complete_permission_gate.sql",
  );

  assert.match(source, /CREATE OR REPLACE FUNCTION public\.complete_stocktake/);
  assert.match(
    source,
    /public\.has_permission\(v_session\.branch_id, 'inventory:stocktake_complete'\)/,
  );
  assert.match(source, /RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'/);
});
