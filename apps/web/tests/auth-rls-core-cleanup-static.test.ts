import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const kdsMigration = readFileSync(
  resolve(repoRoot, "supabase/migrations/_archive/20260629190446_kds_inline_branch_scope.sql"),
  "utf8",
);
const scopeMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/_archive/20260629190445_auth_rls_permission_scope_cleanup.sql",
  ),
  "utf8",
);
const canonicalTemplateMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/_archive/20260630031456_canonicalize_branch_manager_template.sql",
  ),
  "utf8",
);
const authTypes = readFileSync(
  resolve(repoRoot, "packages/shared/src/auth/types.ts"),
  "utf8",
);

function extractSqlFunction(source: string, name: string): string {
  const pattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\b[\\s\\S]*?\\n\\$\\$;`,
    "i",
  );
  const match = source.match(pattern);
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

test("KDS branch scope cleanup does not call can_access_branch from active RPC bodies", () => {
  for (const name of [
    "bump_kds_ticket",
    "complete_kds_tickets",
    "mark_kds_item_out_of_stock",
    "recall_kds_ticket",
  ]) {
    const body = extractSqlFunction(kdsMigration, name);
    assert.doesNotMatch(body, /can_access_branch/);
    assert.match(body, /public\.auth_role\(\) = 'owner'/);
    assert.match(body, /public\.auth_branch_id\(\)/);
  }

  assert.match(kdsMigration, /DROP FUNCTION IF EXISTS public\.can_access_branch\(bigint\)/);
});

test("permission-scope cleanup normalizes existing rows and keeps template grants per-key scoped", () => {
  assert.match(scopeMigration, /CREATE OR REPLACE FUNCTION public\.apply_template_to_user/);
  assert.match(scopeMigration, /CREATE OR REPLACE FUNCTION public\.sync_missing_permissions_from_template/);
  assert.match(scopeMigration, /WHEN v_perm_scope = 'tenant' THEN NULL/);
  assert.match(scopeMigration, /WHEN v_perm_scope = 'branch' THEN p_branch_id/);
  assert.match(scopeMigration, /WHEN v_perm_scope = 'branch' THEN v_branch/);
  assert.match(scopeMigration, /pk\.scope = 'branch'[\s\S]*sp\.branch_id IS NULL/);
  assert.match(scopeMigration, /pk\.scope = 'tenant'[\s\S]*sp\.branch_id IS NOT NULL/);
});

test("active auth templates and target-role lists use canonical access names", () => {
  const retiredNames = [
    ["super", "manager"].join("_"),
    ["area", "manager"].join("_"),
    ["quan", "ly", "vung"].join("_"),
    ["quan", "ly", "CN"].join("_"),
    ["cashier", "floor"].join("_"),
    ["phu", "bep"].join("_"),
    ["kho", "truong"].join("_"),
    ["bep", "truong"].join("_"),
  ];
  const checkedSources = [
    "supabase/_local-dev/dev-tenant-seed.sql",
    "supabase/tests/branch_manager_kds_permissions_test.sql",
    "supabase/migrations/00000000000000_baseline.sql",
  ];

  for (const file of checkedSources) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    for (const retired of retiredNames) {
      assert.doesNotMatch(source, new RegExp(`\\b${retired}\\b`), `${file}: ${retired}`);
    }
  }

  for (const canonicalName of [
    "cashier",
    "kitchen_helper",
    "warehouse_manager",
    "head_chef",
    "branch_manager",
  ]) {
    assert.match(
      canonicalTemplateMigration,
      new RegExp(`'${canonicalName}'`),
      `migration should canonicalize ${canonicalName}`,
    );
  }
  assert.match(canonicalTemplateMigration, /public\.split_order\(bigint,jsonb,uuid\)/);
  assert.match(canonicalTemplateMigration, /weekly_grn_override_report/);
  assert.match(canonicalTemplateMigration, /ARRAY\['owner','branch_manager'\]::TEXT\[\]/);
});

test("compatibility service position remains an alias, not an access bucket", () => {
  const compatibilityServicePosition = ["wait", "er"].join("");
  const accessBuckets = authTypes.match(
    /export const ACCESS_BUCKETS = \[[\s\S]*?\] as const;/,
  )?.[0];

  assert.ok(accessBuckets, "missing ACCESS_BUCKETS block");
  assert.doesNotMatch(accessBuckets, new RegExp(`"${compatibilityServicePosition}"`));
  assert.match(
    authTypes,
    new RegExp(`${compatibilityServicePosition}:\\s*"cashier"`),
    "compatibility service position must map to cashier for prior tokens/data",
  );
});
