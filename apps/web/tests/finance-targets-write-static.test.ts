import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  extractSqlFunction,
  listActiveMigrationFiles,
  readActiveMigrationSql,
  readSql,
} from "./_lib/active-sql.ts";

const root = resolve(process.cwd(), "../..");
const activeSql = readActiveMigrationSql(root);

function readRepo(relPath: string): string {
  return readFileSync(resolve(root, relPath), "utf8");
}

function sliceExport(
  source: string,
  name: string,
  nextName?: string,
): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = nextName
    ? source.indexOf(`export async function ${nextName}`, start + 1)
    : source.length;
  assert.ok(end > start, `missing end for ${name}`);
  return source.slice(start, end);
}

function extractLastPolicy(source: string, name: string): string {
  const matches = [
    ...source.matchAll(
      new RegExp(`CREATE POLICY ${name}\\b[\\s\\S]*?;`, "g"),
    ),
  ];
  const last = matches.at(-1)?.[0] ?? "";
  assert.notEqual(last, "", `missing policy ${name}`);
  return last;
}

function latestMigration(suffix: string): string {
  const files = listActiveMigrationFiles(root).filter((file) =>
    file.endsWith(`_${suffix}.sql`),
  );
  const file = files.at(-1);
  assert.ok(file, `missing migration ${suffix}`);
  return readSql(root, `supabase/migrations/${file}`);
}

test("target write actions use finance:targets_write, not finance:view", () => {
  const actions = readRepo(
    "apps/web/app/(protected)/finance/targets/actions.ts",
  );
  const list = sliceExport(
    actions,
    "listBranchRevenueTargets",
    "upsertBranchRevenueTargets",
  );
  const upsert = sliceExport(
    actions,
    "upsertBranchRevenueTargets",
    "deleteBranchRevenueTarget",
  );
  const remove = sliceExport(
    actions,
    "deleteBranchRevenueTarget",
    "listBranchRevenueTargetProgress",
  );
  const progress = sliceExport(actions, "listBranchRevenueTargetProgress");

  assert.match(list, /finance:view/);
  assert.match(progress, /finance:view/);
  assert.match(upsert, /PERMISSION_KEYS\.FINANCE_TARGETS_WRITE/);
  assert.match(remove, /PERMISSION_KEYS\.FINANCE_TARGETS_WRITE/);
  assert.doesNotMatch(upsert, /finance:view/);
  assert.doesNotMatch(remove, /finance:view/);
});

test("target write RPCs and RLS use finance:targets_write only", () => {
  const upsert = extractSqlFunction(activeSql, "upsert_branch_revenue_targets");
  const remove = extractSqlFunction(activeSql, "delete_branch_revenue_target");
  assert.notEqual(upsert, "");
  assert.notEqual(remove, "");

  for (const body of [upsert, remove]) {
    assert.match(body, /has_permission_any\('finance:targets_write'\)/);
    assert.doesNotMatch(body, /has_permission_any\('finance:view'\)/);
    assert.doesNotMatch(body, /auth_is_owner/);
    assert.doesNotMatch(body, /has_position\('accountant'\)/);
    assert.doesNotMatch(body, /auth_role\(\)/);
  }

  for (const name of [
    "branch_revenue_targets_insert",
    "branch_revenue_targets_update",
    "branch_revenue_targets_delete",
  ]) {
    const policy = extractLastPolicy(activeSql, name);
    assert.match(policy, /has_permission_any\('finance:targets_write'\)/);
    assert.doesNotMatch(policy, /finance:view/);
    assert.doesNotMatch(policy, /auth_role\(\)/);
  }

  const select = extractLastPolicy(activeSql, "branch_revenue_targets_select");
  assert.match(select, /finance:view/);
  assert.match(select, /branch_manager/);
});

test("finance_targets_write migration seeds the write key for owner and accountant", () => {
  const migration = latestMigration("finance_targets_write");
  assert.match(migration, /'finance:targets_write'/);
  assert.match(migration, /is_delegable_to_staff/);
  assert.match(migration, /tenant_owner/);
  assert.match(migration, /position_code IN \('accountant', 'owner'\)/);
  assert.doesNotMatch(
    migration,
    /has_permission_any\('finance:view'\)/,
  );
});
