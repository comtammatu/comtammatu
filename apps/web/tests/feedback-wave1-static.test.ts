import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const webRoot = process.cwd();

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readWeb(path: string): string {
  return readFileSync(join(webRoot, path), "utf8");
}

function existsRepo(path: string): boolean {
  return existsSync(resolve(repoRoot, path));
}

test("Wave 1 feedback migration RPC is service_role-only with empty search_path", () => {
  const migration = readRepo(
    "supabase/migrations/20260728062249_qr_feedback_wave1.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.submit_feedback\([\s\S]*?SECURITY DEFINER/,
  );
  assert.match(migration, /SET search_path TO ''/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.submit_feedback\([\s\S]*?\) TO service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.submit_feedback\([\s\S]*?\) FROM anon, authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.submit_feedback\([\s\S]*?\) FROM PUBLIC/,
  );
});

test("Wave 1 permission catalog is branch-scoped and delegable with BM backfill", () => {
  const migration = readRepo(
    "supabase/migrations/20260728062249_qr_feedback_wave1.sql",
  );
  const permissions = readRepo("packages/shared/src/auth/permissions.ts");
  const fixture = readWeb("tests/fixtures/supabase-e2e/tenant.sql");

  assert.match(permissions, /FEEDBACK_VIEW: "feedback:view"/);
  assert.match(permissions, /FEEDBACK_MANAGE_QR: "feedback:manage_qr"/);
  assert.match(permissions, /PERMISSION_KEY_COUNT = 92/);

  assert.match(
    migration,
    /\('feedback:view'[\s\S]*?'branch'[\s\S]*?true\)/,
  );
  assert.match(
    migration,
    /\('feedback:manage_qr'[\s\S]*?'branch'[\s\S]*?true\)/,
  );
  assert.match(migration, /INSERT INTO public\.staff_permissions/);
  assert.match(migration, /'feedback:view'/);
  assert.match(migration, /'feedback:manage_qr'/);

  assert.match(fixture, /\('feedback:view'/);
  assert.match(fixture, /\('feedback:manage_qr'/);
});

test("Wave 1 schema keeps composite ownership and no phone/photo/AI restore", () => {
  const migration = readRepo(
    "supabase/migrations/20260728062249_qr_feedback_wave1.sql",
  );

  assert.match(migration, /feedback_qr_codes_branch_tenant_fkey/);
  assert.match(migration, /feedback_qr_codes_table_scope_fkey/);
  assert.match(
    migration,
    /UNIQUE \(qr_code_id, client_submission_id\)/,
  );
  assert.doesNotMatch(migration, /view_phone|guest_phone|phone_number/);
  assert.doesNotMatch(migration, /is_suspect|telegram|openai|photo_url/);
  assert.doesNotMatch(migration, /feedback_settings/);
});

test("public guest paths and staff surfaces exist without admin restore", () => {
  for (const path of [
    "apps/web/app/r/[token]/page.tsx",
    "apps/web/app/r/[token]/feedback-form.tsx",
    "apps/web/app/api/feedback/[token]/route.ts",
    "apps/web/lib/feedback/contracts.ts",
    "apps/web/lib/feedback/server.ts",
    "apps/web/lib/feedback/request-security.ts",
    "apps/web/app/(protected)/feedback/page.tsx",
    "apps/web/app/(protected)/feedback/qr/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/qr/page.tsx",
    "docs/modules/feedback.md",
  ]) {
    assert.equal(existsRepo(path), true, path);
  }

  assert.equal(existsRepo("apps/web/app/(protected)/admin/feedback"), false);
  assert.equal(existsRepo("packages/shared/src/feedback"), false);

  const routeResolution = readRepo(
    "packages/shared/src/auth/route-resolution.ts",
  );
  assert.match(routeResolution, /"\/r"/);
  assert.match(routeResolution, /"\/api\/feedback"/);

  const api = readWeb("app/api/feedback/[token]/route.ts");
  assert.match(api, /validateFeedbackMutationRequest/);
  assert.match(api, /Honeypot|website/);
  assert.match(api, /Retry-After/);

  const contracts = readWeb("lib/feedback/contracts.ts");
  assert.match(contracts, /FEEDBACK_MUTATION_HEADER = "x-feedback-request"/);

  const security = readWeb("lib/feedback/request-security.ts");
  assert.match(security, /FEEDBACK_MUTATION_HEADER/);
  assert.match(security, /sec-fetch-site/);
  assert.match(security, /same-origin/);
});

test("ACL modules wire Owner /feedback and Branch /br/*/feedback", () => {
  const acl = readRepo("packages/shared/src/auth/module-acl.ts");
  assert.match(acl, /feedback:\s*\{[\s\S]*?path: "\/feedback"/);
  assert.match(acl, /branch_feedback:\s*\{[\s\S]*?path: "\/br\/\*\/feedback"/);

  const bottomNav = readWeb(
    "app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/feedback`/);
});
