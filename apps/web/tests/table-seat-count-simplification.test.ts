import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";

function readWebSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepoSource(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const tableWorkflowSources = [
  "app/(protected)/br/_shared/settings/tables/actions.ts",
  "app/(protected)/br/_shared/settings/tables/table-form-dialog.tsx",
  "app/(protected)/br/_shared/settings/tables/table-table.tsx",
  "app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  "app/(protected)/br/[branchId]/(operator)/settings/tables/page.tsx",
  "app/(protected)/br/[branchId]/pos/page.tsx",
  "app/(protected)/br/[branchId]/pos/session-actions.ts",
].map((path) => [path, readWebSource(path)] as const);

test("table settings and POS table selection do not expose seat count", () => {
  for (const [path, source] of tableWorkflowSources) {
    assert.doesNotMatch(
      source,
      /capacity|Sức chứa|sức chứa|số chỗ| chỗ|người/,
      `${path} should not expose table seat-count copy or payload fields`,
    );
  }
});

test("table creation still relies on the database default capacity", () => {
  const actionSource = readWebSource(
    "app/(protected)/br/_shared/settings/tables/actions.ts",
  );
  const baselineSource = normalizePgDumpSql(
    readRepoSource("supabase/migrations/20260727120000_baseline.sql"),
  );

  assert.match(
    baselineSource,
    /capacity integer DEFAULT 4 NOT NULL/,
    "tables.capacity must keep a valid backend default while the UI omits it",
  );
  assert.doesNotMatch(
    actionSource,
    /capacity\s*:/,
    "table actions should not submit capacity from create/update workflows",
  );
  assert.doesNotMatch(
    actionSource,
    /fd\.get\("capacity"\)/,
    "table actions should not read a capacity form field",
  );
});
