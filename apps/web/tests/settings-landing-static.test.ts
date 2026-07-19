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

test("Owner settings uses a permission-scoped landing instead of redirecting to one form", () => {
  const landing = readAppFile("app/(protected)/settings/page.tsx");
  const frame = readAppFile("app/(protected)/settings/settings-page-frame.tsx");
  const archetypes = readRepoFile("scripts/page-archetypes.mjs");

  assert.doesNotMatch(landing, /redirect\("\/settings\/general"\)/);
  assert.match(landing, /canManageTenantStrategySettings/);
  assert.match(landing, /canManageBranchFloorSettings/);
  assert.match(landing, /<AppSection/);
  assert.match(landing, /<LinkCardGrid>/);
  assert.match(landing, /href="\/settings\/general"/);
  assert.match(landing, /href="\/settings\/payments"/);
  assert.match(landing, /href="\/settings\/printers"/);
  assert.match(frame, /showSettingsHomeLink/);
  assert.match(frame, /href="\/settings"/);
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/settings\/page\.tsx": "LANDING"/,
  );
});
