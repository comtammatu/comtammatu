import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(root + path, "utf8");
}

function readPgDumpObject(source: string, createPrefix: string): string {
  const start = source.indexOf(createPrefix);
  assert.notEqual(start, -1, "missing pg_dump object: " + createPrefix);
  const end = source.indexOf(
    "\n\n--\n-- Name:",
    start + createPrefix.length,
  );
  assert.notEqual(end, -1, "unterminated pg_dump object: " + createPrefix);
  return source.slice(start, end);
}

const baseline = read("supabase/migrations/00000000000000_baseline.sql");
const retirement = read(
  "supabase/migrations/20260713221534_drop_legacy_confirm_production_run_overload.sql",
);
const productionActions = read(
  "apps/web/app/(protected)/inventory/production-run-actions.ts",
);

const legacyOverload = readPgDumpObject(
  baseline,
  "CREATE FUNCTION public.confirm_production_run(p_run_id bigint, p_actual_quantity numeric DEFAULT NULL::numeric)",
);
const canonicalOverload = readPgDumpObject(
  baseline,
  "CREATE FUNCTION public.confirm_production_run(p_run_id bigint, p_actual_quantity numeric DEFAULT NULL::numeric, p_actual_ingredients jsonb DEFAULT NULL::jsonb)",
);
const atomicProductionRpc = readPgDumpObject(
  baseline,
  "CREATE FUNCTION public.record_production_run(",
);

test("PROD baseline exposes a separately privileged unsafe two-argument overload", () => {
  assert.match(
    legacyOverload,
    /UPDATE public\.ingredients SET unit_cost = v_out_unit_cost/,
  );
  assert.doesNotMatch(
    canonicalOverload,
    /UPDATE public\.ingredients SET unit_cost = v_out_unit_cost/,
  );
  assert.match(
    baseline,
    /GRANT ALL ON FUNCTION public\.confirm_production_run\(p_run_id bigint, p_actual_quantity numeric\) TO authenticated;/,
  );
  assert.match(
    baseline,
    /GRANT ALL ON FUNCTION public\.confirm_production_run\(p_run_id bigint, p_actual_quantity numeric\) TO service_role;/,
  );
});

test("all live app and SQL callers select the canonical three-argument contract", () => {
  assert.match(
    productionActions,
    /supabase\.rpc\("confirm_production_run", \{\s*p_run_id:[\s\S]*p_actual_quantity:[\s\S]*p_actual_ingredients:/,
  );
  assert.match(
    atomicProductionRpc,
    /RETURN public\.confirm_production_run\(\s*v_run_id,\s*p_actual_quantity,\s*p_actual_ingredients\s*\);/,
  );
  assert.match(canonicalOverload, /\bp_actual_ingredients jsonb\b/);
});

test("forward migration revokes and drops only the two-argument overload", () => {
  const revoke = retirement.indexOf(
    "REVOKE ALL ON FUNCTION public.confirm_production_run(bigint, numeric)",
  );
  const drop = retirement.indexOf(
    "DROP FUNCTION public.confirm_production_run(bigint, numeric) RESTRICT;",
  );

  assert.ok(revoke >= 0);
  assert.ok(drop > revoke);
  assert.match(
    retirement,
    /FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(retirement, /CASCADE/);
  assert.doesNotMatch(
    retirement,
    /confirm_production_run\(bigint, numeric, jsonb\)/,
  );
  assert.doesNotMatch(retirement, /CREATE (?:OR REPLACE )?FUNCTION/);
  assert.doesNotMatch(
    retirement,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE)\b/,
  );
  assert.match(retirement, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});
