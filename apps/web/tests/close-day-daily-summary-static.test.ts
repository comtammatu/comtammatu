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
  const messages = read("apps/web/lib/messages/settings.ts");
  const migration = read(
    "supabase/migrations/20260808085336_retire_close_branch_day_ceremony.sql",
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
  assert.match(client, /closeDayCutoffNote/);
  assert.match(messages, /Báo cáo tổng hợp ngày/);
  assert.doesNotMatch(messages, /closeDaySubmit:/);
  assert.match(migration, /branch_day_close_retired/);
  assert.match(migration, /ADR 0024/);
});
