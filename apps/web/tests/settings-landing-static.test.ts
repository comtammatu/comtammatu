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
  assert.match(landing, /<LinkCardGrid/);
  assert.match(landing, /href="\/settings\/general"/);
  assert.match(landing, /href="\/settings\/payments"/);
  assert.match(landing, /href="\/settings\/printers"/);
  assert.match(landing, /ctaLabel=\{copy\.openSettings\}/);
  assert.match(frame, /showSettingsHomeLink/);
  assert.match(frame, /href="\/settings"/);
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/settings\/page\.tsx": "LANDING"/,
  );
});

test("Owner settings routes use the shared hierarchy and field description components", () => {
  const frame = readAppFile("app/(protected)/settings/settings-page-frame.tsx");
  const payments = readAppFile(
    "app/(protected)/settings/(tenant)/payments/payments-form.tsx",
  );
  const general = readAppFile(
    "app/(protected)/settings/(tenant)/general/settings-form.tsx",
  );

  assert.match(frame, /@comtammatu\/ui\/components\/breadcrumb/);
  assert.match(payments, /<FieldDescription id="enable-vietqr-description">/);
  assert.match(payments, /<DescriptionList/);
  assert.doesNotMatch(
    payments,
    /<p className="text-2xs text-muted-foreground">/,
  );
  assert.match(general, /<DescriptionList/);
  assert.match(general, /<NoteCallout/);
});
