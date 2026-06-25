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
    "supabase/migrations/_archive/20260524010000_stocktake_complete_permission_gate.sql",
  );

  assert.match(source, /CREATE OR REPLACE FUNCTION public\.complete_stocktake/);
  assert.match(
    source,
    /public\.has_permission\(v_session\.branch_id, 'inventory:stocktake_complete'\)/,
  );
  assert.match(source, /RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'/);
});

test("stocktake heartbeat lock RPC rechecks ttl and branch permission", () => {
  const source = readRepoFile(
    "supabase/migrations/20260625165845_harden_stocktake_heartbeat_lock.sql",
  );

  assert.match(source, /CREATE OR REPLACE FUNCTION public\.heartbeat_zone_lock/);
  assert.match(
    source,
    /p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 OR p_ttl_seconds > 7200/,
  );
  assert.match(source, /SELECT ss\.tenant_id, ss\.branch_id/);
  assert.match(source, /FROM public\.stocktake_sessions ss/);
  assert.match(source, /RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'/);
  assert.match(
    source,
    /public\.has_permission\(v_branch, 'inventory:stocktake_create'\)/,
  );
  assert.match(source, /WHERE session_id = p_session_id/);
  assert.match(source, /AND zone_id = p_zone_id/);
  assert.match(source, /AND locked_by = v_uid/);
  assert.doesNotMatch(
    source,
    /REVOKE\s+EXECUTE[\s\S]*heartbeat_zone_lock[\s\S]*authenticated/i,
  );
});
