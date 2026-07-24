import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/20260724030942_enforce_self_order_payment_fingerprint_v1.sql",
  ),
  "utf8",
);

test("self-order payment fingerprints are enforced as payment:v1", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_fill_payment_request_fingerprint\(\)/,
  );
  assert.match(
    migration,
    /NEW\.request_fingerprint_version := 'payment:v1';/,
  );
  assert.match(
    migration,
    /DROP CONSTRAINT self_order_payment_requests_fingerprint_version_check/,
  );
  assert.match(
    migration,
    /CHECK \(request_fingerprint_version = 'payment:v1'\)/,
  );
});
