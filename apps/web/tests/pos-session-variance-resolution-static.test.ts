import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  isPosSessionVarianceBreached,
  isPosSessionWorkItem,
} from "../app/(protected)/br/[branchId]/(operator)/pos-sessions/_lib/normalize";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("POS session work queue keeps only open or unresolved over-threshold sessions", () => {
  const session = {
    status: "closed",
    expected_cash: 0,
    cash_difference: 50_001,
    variance_approval_note: null,
  } as Parameters<typeof isPosSessionWorkItem>[0];

  assert.equal(isPosSessionVarianceBreached(session), true);
  assert.equal(isPosSessionWorkItem(session), true);
  assert.equal(
    isPosSessionVarianceBreached({
      ...session,
      expected_cash: 20_000_000,
      cash_difference: 80_000,
    }),
    false,
  );
  assert.equal(
    isPosSessionWorkItem({ ...session, variance_approval_note: "Đã thu bù" }),
    false,
  );
  assert.equal(isPosSessionWorkItem({ ...session, status: "open" }), true);
});

test("POS session variance resolution keeps the close-time cash difference immutable", () => {
  const action = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  const migration = read(
    "supabase/migration-archive/20260705203920_pos_session_variance_resolution.sql",
  );

  assert.match(action, /resolvePosSessionVariance/);
  assert.match(action, /PERMISSION_KEYS\.POS_CLOSE_SHIFT/);
  assert.match(action, /variance_approval_note/);
  assert.match(action, /variance_approver_user_id/);
  assert.doesNotMatch(action, /\.update\(\{[\s\S]*cash_difference/m);

  assert.match(client, /resolvePosSessionVariance/);
  assert.match(client, /varianceResolvedShort/);
  assert.match(client, /varianceResolutionLabel/);

  assert.match(migration, /ps\.variance_approval_note IS NULL/);
  assert.match(
    migration,
    /Aggregate unresolved over-threshold POS cash variance/,
  );
});

test("Branch POS sessions separate list and detail without dropping evidence", () => {
  const listPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/page.tsx",
  );
  const detailPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/[sessionId]/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  const reportAction = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/report-actions.ts",
  );
  const archetypes = read("scripts/page-archetypes.mjs");
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(listPage, /PosSessionsListClient/);
  assert.doesNotMatch(listPage, /getPosSessionReport|\.from\("orders"\)/);
  assert.match(listPage, /query\.view === "history"/);
  assert.match(listPage, /const PAGE_SIZE = 20/);
  assert.match(
    listPage,
    /\.range\(\(page - 1\) \* PAGE_SIZE, page \* PAGE_SIZE\)/,
  );
  assert.match(listPage, /\.eq\("status", "open"\)/);
  assert.match(listPage, /isPosSessionWorkItem/);
  assert.match(client, /<Tabs value=\{view\}>/);
  assert.match(client, /\?view=history/);
  assert.match(
    client,
    /href=\{`\/br\/\$\{branchId\}\/pos-sessions\/\$\{session\.id\}`\}/,
  );
  assert.doesNotMatch(client, /\?session=|SessionReportCard|onCloseShift/);
  assert.equal(
    (home.match(/`\/br\/\$\{context\.branchId\}\/pos-sessions`/g) ?? []).length,
    1,
  );
  assert.match(home, /title: MODULE_ACL\.branch_pos_sessions\.label/);

  assert.match(detailPage, /PosSessionDetailClient/);
  assert.match(detailPage, /\.eq\("id", sessionId\)/);
  assert.match(detailPage, /\.eq\("branch_id", branchId\)/);
  assert.match(detailPage, /\.eq\("tenant_id", claims\.tenant_id\)/);
  assert.match(detailPage, /\.eq\("pos_session_id", sessionId\)/);
  assert.match(detailPage, /backHref=\{`\/br\/\$\{branchId\}\/pos-sessions`\}/);

  assert.match(client, /!isOpen && breached/);
  assert.match(client, /resolvePosSessionVariance/);
  assert.match(client, /OrderDetailDrawer/);
  assert.match(reportAction, /export async function getPosSessionReport/);
  assert.match(archetypes, /pos-sessions\/page\.tsx":\s*"LIST"/);
  assert.match(
    archetypes,
    /pos-sessions\/\[sessionId\]\/page\.tsx":\s*"DETAIL"/,
  );
});
