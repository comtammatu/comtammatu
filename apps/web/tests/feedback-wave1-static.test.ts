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
  assert.match(permissions, /PERMISSION_KEY_COUNT = 91/);

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

test("Feedback LIST surfaces use AppToolbar section nav and AppListFrame", () => {
  const subNav = readWeb(
    "app/(protected)/feedback/_components/feedback-sub-nav.tsx",
  );
  assert.match(subNav, /<AppToolbar/);
  assert.doesNotMatch(subNav, /border-b border-border/);
  assert.doesNotMatch(subNav, /cn\(/);

  const layout = readWeb("app/(protected)/feedback/layout.tsx");
  assert.match(layout, /<AppPage width="xwide">/);
  assert.match(layout, /FeedbackSubNav/);

  const inbox = readWeb(
    "app/(protected)/feedback/_components/feedback-inbox.tsx",
  );
  assert.match(inbox, /<AppListFrame/);
  assert.match(inbox, /<AppToolbar[\s\S]*variant="inline"/);
  assert.match(inbox, /BRANCH_VI/);
  assert.doesNotMatch(inbox, /max-w-xs/);

  const qr = readWeb(
    "app/(protected)/feedback/_components/qr-management.tsx",
  );
  assert.match(qr, /<AppListFrame/);
  assert.match(qr, /RowActionsMenu/);
  assert.match(qr, /DataTable/);
  assert.doesNotMatch(qr, /md:grid-cols-3/);
  assert.doesNotMatch(qr, /AppListFrame[\s\S]*?\baction=\{/);

  const createButton = readWeb(
    "app/(protected)/feedback/_components/create-feedback-qr-button.tsx",
  );
  assert.match(createButton, /FormDialog/);
  assert.match(createButton, /CreateFeedbackQrButton/);

  const ownerInbox = readWeb("app/(protected)/feedback/page.tsx");
  const ownerQr = readWeb("app/(protected)/feedback/qr/page.tsx");
  assert.doesNotMatch(ownerInbox, /<AppPage\b/);
  assert.doesNotMatch(ownerQr, /<AppPage\b/);
  assert.doesNotMatch(ownerInbox, /FeedbackSubNav/);
  assert.doesNotMatch(ownerQr, /FeedbackSubNav/);
  assert.match(ownerInbox, /getModuleLabelVi\("feedback"\)/);
  assert.match(ownerQr, /getModuleLabelVi\("feedback"\)/);
  assert.match(ownerQr, /CreateFeedbackQrButton/);
  assert.match(ownerQr, /actions=\{/);

  const branchInbox = readWeb(
    "app/(protected)/br/[branchId]/(operator)/feedback/page.tsx",
  );
  const branchQr = readWeb(
    "app/(protected)/br/[branchId]/(operator)/feedback/qr/page.tsx",
  );
  assert.match(branchInbox, /BranchOperatorPage/);
  assert.match(branchQr, /BranchOperatorPage/);
  assert.doesNotMatch(branchInbox, /<AppPage\b/);
  assert.doesNotMatch(branchQr, /<AppPage\b/);
  assert.match(branchInbox, /presentation="branch"/);
  assert.match(branchQr, /presentation="branch"/);
  assert.match(branchQr, /CreateFeedbackQrButton/);
});
