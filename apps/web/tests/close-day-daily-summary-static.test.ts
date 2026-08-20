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
  const reportRpcFrom = read(
    "supabase/migrations/20260820014659_get_branch_day_report_order_facts_from.sql",
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
  assert.match(
    client,
    /className="flex w-full min-w-0 flex-col gap-4"/,
    "close-day report stack must grow with content, not flex-1/min-h-0",
  );
  assert.doesNotMatch(
    client,
    /className="flex min-h-0 flex-1 flex-col gap-4"/,
    "close-day must not height-constrain its panel stack",
  );
  const dateNav = client.slice(
    client.indexOf("const dateNav = ("),
    client.indexOf("if (loadFailed)"),
  );
  assert.match(
    dateNav,
    /<div className="flex w-full min-w-0 flex-nowrap items-center gap-2">/,
  );
  assert.match(dateNav, /size="icon-touch"/);
  assert.match(dateNav, /aria-label=\{copy\.closeDayPrevDate\}/);
  assert.match(dateNav, /aria-label=\{copy\.closeDayNextDate\}/);
  assert.doesNotMatch(dateNav, /size="sm"/);
  assert.doesNotMatch(dateNav, />\s*\{copy\.closeDayPrevDate\}/);
  assert.doesNotMatch(dateNav, />\s*\{copy\.closeDayNextDate\}/);
  assert.doesNotMatch(
    client,
    /<BranchOperatorControlBar className="sm:hidden">/,
  );
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
  assert.match(reportRpcFrom, /v_paid_orders\s+FROM order_facts/);
  assert.match(reportRpcFrom, /CREATE OR REPLACE FUNCTION public\.get_branch_day_report/);
});
