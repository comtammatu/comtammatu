import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

const repoRoot = resolve(process.cwd(), "../..");
const approvalMigration = readSql(repoRoot, "supabase/migrations/20260829164500_fix_waste_self_approval_and_deadlocks.sql");
const recoveryMigration = readSql(repoRoot, "supabase/migrations/20260829190058_repair_inventory_unit_rebase_incident.sql");

test("count-slip waste recovery is tenant-safe and rejects malformed references", () => {
  assertSqlNotMatch(approvalMigration, /_post_writeoff_movements\(v_row\.id\)/);
  assertSqlMatch(recoveryMigration, /cs\.tenant_id\s*=\s*si\.tenant_id/);
  assertSqlMatch(recoveryMigration, /\^\[1-9\]\[0-9\]\*\$/);
});

test("count-slip waste recovery cannot approve an issue without posting movements", () => {
  assertSqlMatch(recoveryMigration,
    /PERFORM public\._post_writeoff_movements\(v_row\.id\)/,
  );
  assertSqlMatch(recoveryMigration,
    /set_config\([\s\S]*request\.jwt\.claims[\s\S]*v_row\.created_by/,
  );
  assertSqlNotMatch(recoveryMigration, /EXCEPTION WHEN OTHERS[\s\S]*?NULL/);
  assertSqlMatch(recoveryMigration,
    /WHERE id = v_row\.id[\s\S]*tenant_id = v_row\.tenant_id[\s\S]*approval_status = 'pending'/,
  );
  assertSqlMatch(recoveryMigration, /auto-recovery deferred: unsafe to post/);
});
