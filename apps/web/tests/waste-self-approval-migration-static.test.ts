import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const approvalMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260829164500_fix_waste_self_approval_and_deadlocks.sql",
  ),
  "utf8",
);
const recoveryMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260829190058_repair_inventory_unit_rebase_incident.sql",
  ),
  "utf8",
);

test("count-slip waste recovery is tenant-safe and rejects malformed references", () => {
  assert.doesNotMatch(approvalMigration, /_post_writeoff_movements\(v_row\.id\)/);
  assert.match(recoveryMigration, /cs\.tenant_id\s*=\s*si\.tenant_id/);
  assert.match(recoveryMigration, /\^\[1-9\]\[0-9\]\*\$/);
});

test("count-slip waste recovery cannot approve an issue without posting movements", () => {
  assert.match(
    recoveryMigration,
    /PERFORM public\._post_writeoff_movements\(v_row\.id\)/,
  );
  assert.match(
    recoveryMigration,
    /set_config\([\s\S]*request\.jwt\.claims[\s\S]*v_row\.created_by/,
  );
  assert.doesNotMatch(recoveryMigration, /EXCEPTION WHEN OTHERS[\s\S]*?NULL/);
  assert.match(
    recoveryMigration,
    /WHERE id = v_row\.id[\s\S]*tenant_id = v_row\.tenant_id[\s\S]*approval_status = 'pending'/,
  );
  assert.match(recoveryMigration, /auto-recovery deferred: unsafe to post/);
});
