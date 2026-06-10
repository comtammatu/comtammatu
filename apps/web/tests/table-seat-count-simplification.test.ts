import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWebSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepoSource(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const tableWorkflowSources = [
  "app/(protected)/admin/settings/tables/actions.ts",
  "app/(protected)/admin/settings/tables/page.tsx",
  "app/(protected)/admin/settings/tables/table-form-dialog.tsx",
  "app/(protected)/admin/settings/tables/table-table.tsx",
  "app/(protected)/br/[branchId]/settings/page.tsx",
  "app/(protected)/br/[branchId]/settings/tables/page.tsx",
  "app/(protected)/br/[branchId]/pos/page.tsx",
  "app/(protected)/br/[branchId]/pos/session-actions.ts",
].map((path) => [path, readWebSource(path)] as const);

const tableUserGuideSources = [
  "docs/user-guides/pos/flows/pos-02-select-context.md",
  "docs/user-guides/pos/flows/pos-07-modify-order.md",
].map((path) => [path, readRepoSource(path)] as const);

test("table settings and POS table selection do not expose seat count", () => {
  for (const [path, source] of tableWorkflowSources) {
    assert.doesNotMatch(
      source,
      /capacity|Sức chứa|sức chứa|số chỗ| chỗ|người/,
      `${path} should not expose table seat-count copy or payload fields`,
    );
  }
});

test("POS user guides do not describe table seat-count copy", () => {
  for (const [path, source] of tableUserGuideSources) {
    assert.doesNotMatch(
      source,
      /Sức chứa|sức chứa|số chỗ|chỗ ngồi|seat-count/,
      `${path} should not reintroduce table seat-count or seat-moving copy`,
    );
  }
});

test("table creation still relies on the database default capacity", () => {
  const actionSource = readWebSource(
    "app/(protected)/admin/settings/tables/actions.ts",
  );
  const baselineSource = readRepoSource(
    "supabase/migrations/00000000000000_baseline.sql",
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
