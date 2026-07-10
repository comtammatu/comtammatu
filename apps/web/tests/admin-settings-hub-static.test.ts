import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readAppFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("Admin settings uses a permission-scoped hub instead of redirecting to one form", () => {
  const hub = readAppFile("app/(protected)/admin/settings/page.tsx");
  const frame = readAppFile("app/(protected)/admin/settings/settings-page-frame.tsx");
  const archetypes = readRepoFile("scripts/page-archetypes.mjs");

  assert.doesNotMatch(hub, /redirect\("\/admin\/settings\/general"\)/);
  assert.match(hub, /canManageTenantStrategySettings/);
  assert.match(hub, /canManageBranchFloorSettings/);
  assert.match(hub, /<AppSection/);
  assert.match(hub, /<LinkCardGrid>/);
  assert.match(hub, /href="\/admin\/settings\/general"/);
  assert.match(hub, /href="\/admin\/settings\/payments"/);
  assert.match(hub, /href="\/admin\/settings\/printers"/);
  assert.match(frame, /showSettingsHomeLink/);
  assert.match(frame, /href="\/admin\/settings"/);
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/admin\/settings\/page\.tsx": "HUB"/,
  );
});
