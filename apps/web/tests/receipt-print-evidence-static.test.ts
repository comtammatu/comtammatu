import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const migration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260731110853_make_receipt_reprints_append_only.sql",
  ),
  "utf8",
);

test("receipt reprints append a linked job without rewriting evidence", () => {
  assert.match(migration, /SET search_path TO ''/);
  assert.match(
    migration,
    /v_reprinted_from_id := v_latest_job\.id;[\s\S]*?reprinted_from_id/,
  );
  assert.match(
    migration,
    /ON CONFLICT \(idempotency_key\) DO NOTHING[\s\S]*?RETURNING id INTO v_job_id/,
  );
  assert.match(migration, /v_payload := v_latest_job\.payload/);
  assert.match(
    migration,
    /v_is_service AND v_latest_job\.status IN \('failed', 'expired'\)[\s\S]*?SET status = 'pending',[\s\S]*?last_error = NULL/,
  );
  assert.match(
    migration,
    /NEW\.idempotency_key := 'order:' \|\| NEW\.order_id::text[\s\S]*?':receipt:reprint:' \|\| NEW\.reprinted_from_id::text/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_01_receipt_reprint_idempotency[\s\S]*?BEFORE INSERT[\s\S]*?scope_receipt_reprint_idempotency\(\)/,
  );
  assert.doesNotMatch(migration, /ON CONFLICT \(idempotency_key\) DO UPDATE/);
});
