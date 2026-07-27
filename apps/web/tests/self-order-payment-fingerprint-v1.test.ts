import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migration-archive/20260724030942_enforce_self_order_payment_fingerprint_v1.sql",
  ),
  "utf8",
);
const baseline = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/20260727120000_baseline.sql",
  ),
  "utf8",
);

test("existing payment fingerprints are verified and promoted before enforcement", () => {
  const preflight = migration.indexOf(
    "self_order_legacy_payment_fingerprint_mismatch",
  );
  const backfill = migration.indexOf(
    "SET request_fingerprint_version = 'payment:v1'",
  );
  const constraint = migration.indexOf(
    "CHECK (request_fingerprint_version = 'payment:v1')",
  );

  assert.ok(preflight >= 0 && backfill > preflight && constraint > backfill);
  assert.match(
    migration,
    /request_fingerprint IS DISTINCT FROM\s+public\.self_order_payment_request_fingerprint\(method, invoice_payload\)/,
  );
  for (const trigger of [
    "trg_self_order_enforce_payment_request_invariants",
    "trg_self_order_payment_requests_updated_at",
  ]) {
    assert.match(migration, new RegExp(`DISABLE TRIGGER ${trigger}`));
    assert.match(migration, new RegExp(`ENABLE TRIGGER ${trigger}`));
  }
});

test("all current payment fingerprint writers emit payment:v1", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_fill_payment_request_fingerprint\(\)/,
  );
  assert.match(
    migration,
    /NEW\.request_fingerprint_version := 'payment:v1';/,
  );
  const createPayment = baseline.slice(
    baseline.indexOf("CREATE FUNCTION public.self_order_create_payment_request"),
    baseline.indexOf(
      "CREATE FUNCTION public.self_order_enforce_open_pos_session",
    ),
  );
  const inserts =
    createPayment.match(
      /INSERT INTO public\.self_order_payment_requests \([\s\S]*?RETURNING \* INTO v_existing;/g,
    ) ?? [];

  assert.equal(inserts.length, 2);
  for (const insert of inserts) {
    assert.match(insert, /request_fingerprint_version/);
    assert.match(insert, /v_fingerprint,\s+'payment:v1'/);
  }
  assert.match(
    migration,
    /DROP CONSTRAINT self_order_payment_requests_fingerprint_version_check/,
  );
  assert.match(
    migration,
    /CHECK \(request_fingerprint_version = 'payment:v1'\)/,
  );
});
