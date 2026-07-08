import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const grnActions = readRepo("apps/web/app/(protected)/inventory/grn-actions.ts");
const grnCreatePage = readRepo(
  "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
);
const migration = readRepo(
  "supabase/migrations/20260708111916_fix_grn_draft_branch_scope.sql",
);

test("GRN supplier drafts are looked up in the selected receiving branch", () => {
  assert.match(
    grnActions,
    /branchId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/,
  );
  assert.match(
    grnCreatePage,
    /loadActiveGrnDraft\(\{\s*supplierId,\s*branchId: defaultBranchId \?\? undefined,\s*\}\)/,
  );

  const loadStart = grnActions.indexOf("export const loadActiveGrnDraft");
  assert.ok(loadStart >= 0, "loadActiveGrnDraft not found");
  const loadBody = grnActions.slice(
    loadStart,
    grnActions.indexOf("/* ─── listMyGrnDrafts", loadStart),
  );

  assert.match(loadBody, /\.eq\("branch_id", data\.branchId\)/);
});

test("GRN supplier draft uniqueness includes the receiving branch", () => {
  assert.match(
    migration,
    /DROP INDEX IF EXISTS public\.uq_grn_active_draft_per_user_supplier;/,
  );
  assert.match(
    migration,
    /DROP INDEX IF EXISTS public\.uq_grn_active_draft_per_user_supplier_branch;/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX uq_grn_active_draft_per_user_supplier_branch/,
  );
  assert.match(
    migration,
    /ON public\.goods_received_notes \(tenant_id, created_by, supplier_id, branch_id\)/,
  );
  assert.match(
    migration,
    /WHERE status = 'draft' AND created_by IS NOT NULL;/,
  );

  const createStart = grnActions.indexOf("export const createGrnDraft");
  assert.ok(createStart >= 0, "createGrnDraft not found");
  const createBody = grnActions.slice(
    createStart,
    grnActions.indexOf("/* ─── loadActiveGrnDraft", createStart),
  );

  assert.match(createBody, /\.eq\("branch_id", targetBranchId\)/);
});
