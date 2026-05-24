import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

const migration = readRepoFile(
  "supabase/migrations/20260601860000_security_definer_rpc_hardening.sql",
);

test("payment and print implementation RPCs are not directly executable by authenticated users", () => {
  for (const signature of [
    "public.finalize_paid_order(BIGINT, UUID)",
    "public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID)",
    "public.claim_print_job(BIGINT, TEXT)",
    "public.complete_print_job(BIGINT, BOOLEAN, TEXT)",
    "public.expire_stuck_print_jobs(INT)",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
      ),
    );
  }
});

test("staff admin RPCs enforce permission gates inside SECURITY DEFINER bodies", () => {
  assert.match(migration, /public\.has_permission_any\('staff:manage'\)/);
  assert.match(
    migration,
    /public\.has_permission_any\('staff:assign_position'\)/,
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501'/,
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501'/,
  );
});
