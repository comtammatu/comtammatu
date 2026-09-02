import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";

const migration = readSql(process.cwd(), "supabase/migrations/20260724030942_enforce_self_order_payment_fingerprint_v1.sql");
const baseline = readSql(process.cwd(), "supabase/migrations/20260902162918_baseline.sql");

test("existing payment fingerprints are verified and promoted before enforcement", () => {
  assertSqlMatch(
    migration,
    /public\.self_order_payment_request_fingerprint/,
  );
  for (const trigger of [
    "trg_self_order_enforce_payment_request_invariants",
    "trg_self_order_payment_requests_updated_at",
  ]) {
    assertSqlMatch(migration, new RegExp(`DISABLE TRIGGER ${trigger}`));
    assertSqlMatch(migration, new RegExp(`ENABLE TRIGGER ${trigger}`));
  }
});

test("all current payment fingerprint writers emit payment:v1", () => {
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_fill_payment_request_fingerprint\(\)/,
  );
  assertSqlMatch(migration,
    /NEW\.request_fingerprint_version := 'payment:v1';/,
  );
  assertSqlMatch(
    baseline,
    /CREATE OR REPLACE FUNCTION public\.self_order_create_payment_request/,
  );
  assertSqlMatch(migration,
    /DROP CONSTRAINT self_order_payment_requests_fingerprint_version_check/,
  );
  assertSqlMatch(migration,
    /CHECK \(request_fingerprint_version = 'payment:v1'\)/,
  );
});
