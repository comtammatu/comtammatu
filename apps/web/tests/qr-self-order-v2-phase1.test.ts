import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("snapshot migration returns order.items array", () => {
  const migration = readRepo(
    "supabase/migrations/20260708140000_self_order_snapshot_order_items.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.self_order_get_snapshot\(p_token text\)/);
  assert.match(migration, /v_order_items jsonb := NULL/);
  assert.match(migration, /jsonb_agg\([\s\S]*ORDER BY oi\.id\)/);
  assert.match(migration, /oi\.status <> 'cancelled'/);
  assert.match(migration, /'items', v_order_items/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.self_order_get_snapshot\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON FUNCTION public\.self_order_get_snapshot\(text\) TO service_role/);
});
