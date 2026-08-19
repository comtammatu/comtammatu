import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("close-day is Daily Summary only (ADR 0024)", () => {
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/close-day-client.tsx",
  );
  const data = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/data.ts",
  );
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/page.tsx",
  );
  const messages = read("apps/web/lib/messages/settings.ts");
  const archetypes = read("scripts/page-archetypes.mjs");
  const acl = read("packages/shared/src/auth/module-acl.ts");
  const migration = read(
    "supabase/migrations/20260808085336_retire_close_branch_day_ceremony.sql",
  );
  const reportRpc = read(
    "supabase/migrations/20260819203012_get_branch_day_report.sql",
  );

  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/actions.ts",
      ),
    ),
    false,
    "closeBranchDay Server Action must be removed",
  );

  assert.doesNotMatch(client, /closeBranchDay|AppDetailFooter|closeDaySubmit/);
  assert.doesNotMatch(client, /confirm\(/);
  assert.doesNotMatch(client, /closing_cash \?\? session\.opening_cash/);
  assert.doesNotMatch(client, /closing_cash \?\? opening_cash/);
  assert.match(client, /closeDayCutoffNote/);
  assert.match(client, /pos-sessions\?session=\$\{session\.id\}/);
  assert.match(data, /get_branch_day_report/);
  assert.match(page, /searchParams/);
  assert.match(page, /date\?: string/);
  assert.match(messages, /Báo cáo tổng hợp ngày/);
  assert.match(messages, /Tổng tiền đã thu/);
  assert.doesNotMatch(messages, /closeDaySubmit:/);
  assert.match(archetypes, /close-day\/page\.tsx":\s*"REPORT"/);
  const financeAcl = acl.match(/finance: \{[\s\S]*?allowedRoles: \[[^\]]+\]/)?.[0];
  assert.ok(financeAcl);
  assert.doesNotMatch(financeAcl, /branch_manager/);
  assert.match(migration, /branch_day_close_retired/);
  assert.match(migration, /ADR 0024/);
  assert.match(reportRpc, /has_permission\(p_branch_id, 'settings:branch'\)/);
  assert.match(reportRpc, /has_permission\(p_branch_id, 'finance:view'\)/);
  assert.doesNotMatch(reportRpc, /GRANT.*finance:view/);
});
