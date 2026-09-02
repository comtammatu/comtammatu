import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(resolve(repoRoot, path), "utf8");

test("tenant settings activate the versioned invoice profile through its guarded RPC", () => {
  const page = read(
    "apps/web/app/(protected)/settings/(tenant)/general/page.tsx",
  );
  const form = read(
    "apps/web/app/(protected)/settings/(tenant)/general/settings-form.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/settings/(tenant)/general/actions.ts",
  );

  assert.match(page, /\.from\("invoice_profiles"\)/);
  assert.match(page, /profile\.status === "active"/);
  assert.match(actions, /activateInvoiceProfileSchema\.safeParse\(input\)/);
  assert.match(
    actions,
    /getAuthContextWithPermission\([\s\S]*PERMISSION_KEYS\.SETTINGS_TENANT/,
  );
  assert.match(actions, /\.rpc\("activate_invoice_profile"\)/);
  assert.doesNotMatch(actions, /error\.message/);
  assert.match(form, /identityForm\.formState\.isDirty/);
  assert.match(form, /disabled=\{!canActivate\}/);
  assert.match(form, /const confirmed = await confirm\(/);
  assert.match(form, /router\.refresh\(\)/);
});
