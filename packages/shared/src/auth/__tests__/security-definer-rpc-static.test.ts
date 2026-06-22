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

const migration = readRepoFile(
  "supabase/migrations/_archive/20260601860000_security_definer_rpc_hardening.sql",
);
const securityHardeningMigration = readRepoFile(
  "supabase/migrations/_archive/20260619062853_security_rpc_cron_runner_hardening.sql",
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

test("service-only implementation RPCs are not executable by authenticated users", () => {
  for (const signature of [
    "public.consume_stock_for_order_service(BIGINT, UUID)",
    "public.create_waste_from_order(BIGINT, BIGINT, TEXT, JSONB, TEXT)",
  ]) {
    assert.match(
      securityHardeningMigration,
      new RegExp(
        `REVOKE (?:ALL|EXECUTE) ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      securityHardeningMigration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
        "i",
      ),
    );
  }

  assert.match(
    securityHardeningMigration,
    /IF auth\.role\(\) IS DISTINCT FROM 'service_role' THEN[\s\S]{0,160}forbidden_service_role_only/,
  );
});

test("POS and inventory RPC bodies enforce branch permission and location scope", () => {
  for (const functionName of [
    "mark_order_item_served",
    "transfer_order_table",
  ]) {
    const body =
      securityHardeningMigration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0] ?? "";
    assert.match(body, /v_prof_branch IS NULL/);
    assert.match(body, /public\.has_permission\([^,]+,\s*'pos:use'\)/);
    assert.match(body, /forbidden: missing pos:use/);
  }

  assert.match(
    securityHardeningMigration,
    /CREATE OR REPLACE FUNCTION public\.create_waste_entry/,
  );
  assert.match(securityHardeningMigration, /FROM public\.inventory_locations/);
  assert.match(securityHardeningMigration, /v_location\.tenant_id <> v_tenant/);
  assert.match(
    securityHardeningMigration,
    /v_location\.branch_id <> p_branch_id/,
  );
  assert.match(securityHardeningMigration, /location_scope_mismatch/);
});
