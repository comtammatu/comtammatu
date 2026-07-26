import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/20260726174857_qualify_inventory_attachment_policy_path.sql",
);
const wastePhotoUpload = readRepo(
  "apps/web/app/(protected)/inventory/_components/waste-photo-upload.tsx",
);

test("inventory attachment inserts resolve branch-scoped document permissions", () => {
  assert.match(
    migration,
    /FROM public\.goods_received_notes AS grn[\s\S]*public\.has_permission\(\s*grn\.branch_id,\s*'procurement:grn_create'\s*\)/,
  );
  assert.match(
    migration,
    /FROM public\.stock_issues AS issue[\s\S]*public\.has_permission\(issue\.branch_id, 'inventory:write'\)/,
  );
  assert.doesNotMatch(
    migration,
    /public\.has_permission\(NULL::bigint, '(?:procurement:grn_create|supplier_return:create|inventory:writeoff)'\)/,
  );
  assert.doesNotMatch(migration, /storage\.foldername\(name\)/);
});

test("pre-persist waste evidence carries an authorized branch in its path", () => {
  assert.match(
    wastePhotoUpload,
    /folder=\{`branches\/\$\{branchId\}\/waste\/\$\{issueId\}`\}/,
  );
  assert.match(
    migration,
    /FROM public\.branches AS branch[\s\S]*public\.has_permission\(branch\.id, 'inventory:writeoff'\)/,
  );
});
