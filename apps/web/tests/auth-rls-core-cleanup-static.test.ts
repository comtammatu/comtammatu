import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const kdsMigration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260629190446_kds_inline_branch_scope.sql"),
  "utf8",
);
const scopeMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260629190445_auth_rls_permission_scope_cleanup.sql",
  ),
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
