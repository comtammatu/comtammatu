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
    "supabase/migration-archive/20260728062249_qr_feedback_wave1.sql",
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
    "supabase/migration-archive/20260728062249_qr_feedback_wave1.sql",
  );
  const permissions = readRepo("packages/shared/src/auth/permissions.ts");
  const fixture = readWeb("tests/fixtures/supabase-e2e/tenant.sql");

  assert.match(permissions, /FEEDBACK_VIEW: "feedback:view"/);
  assert.match(permissions, /FEEDBACK_MANAGE_QR: "feedback:manage_qr"/);
  assert.match(permissions, /PERMISSION_KEY_COUNT = 109/);

  assert.match(migration, /\('feedback:view'[\s\S]*?'branch'[\s\S]*?true\)/);
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
    "supabase/migration-archive/20260728062249_qr_feedback_wave1.sql",
  );

  assert.match(migration, /feedback_qr_codes_branch_tenant_fkey/);
  assert.match(migration, /feedback_qr_codes_table_scope_fkey/);
  assert.match(migration, /UNIQUE \(qr_code_id, client_submission_id\)/);
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
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/feedback`/);

  const layout = readWeb(
    "app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  assert.match(layout, /canAccess\(claims\.user_role, "branch_feedback"\)/);
  assert.match(layout, /href=\{`\/br\/\$\{context\.branchId\}\/feedback`\}/);
});

test("Feedback LIST surfaces use AppToolbar section nav and AppListFrame", () => {
  const subNav = readWeb(
    "app/(protected)/feedback/_components/feedback-sub-nav.tsx",
  );
  assert.match(subNav, /<AppToolbar/);
  assert.match(subNav, /size=\{isTouchLayout \? "touch" : "default"\}/);
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

  const qr = readWeb("app/(protected)/feedback/_components/qr-management.tsx");
  assert.match(qr, /<AppListFrame/);
  assert.match(qr, /RowActionsMenu/);
  assert.match(qr, /DataTable/);
  assert.match(qr, /feedbackCopy\.copyUrl/);
  assert.match(qr, /feedbackCopy\.downloadQr/);
  assert.match(qr, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(qr, /downloadFeedbackQrPng/);
  assert.match(qr, /QRCode\.toDataURL/);
  assert.doesNotMatch(qr, /md:grid-cols-3/);
  assert.doesNotMatch(qr, /AppListFrame[\s\S]*?\baction=\{/);

  const feedbackCopy = readWeb("lib/messages/feedback.ts");
  assert.match(feedbackCopy, /copyUrl:\s*"Sao chép đường dẫn"/);
  assert.match(feedbackCopy, /downloadQr:\s*"Tải QR"/);

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
  assert.match(ownerInbox, /feedbackCopy\.pageTitle/);
  assert.match(ownerQr, /feedbackCopy\.qrTitle/);
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
  assert.match(branchInbox, /BranchFeedbackInboxList/);
  assert.match(branchInbox, /BranchFeedbackTabs/);
  assert.match(branchQr, /BranchFeedbackQrClient/);
  assert.match(branchQr, /BranchFeedbackTabs/);
  assert.doesNotMatch(branchInbox, /\bFeedbackInbox\b|presentation="branch"/);
  assert.doesNotMatch(
    branchQr,
    /\bQrManagement\b|\bCreateFeedbackQrButton\b|presentation="branch"/,
  );
});

test("Wave 1.1 self-order feedback anchors paid order with snapshot columns", () => {
  const migration = readRepo(
    "supabase/migrations/20260810123000_self_order_feedback_order_snapshot.sql",
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS order_id/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS order_number/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS table_number/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS order_created_at/);
  assert.match(migration, /idx_feedbacks_order_id_unique/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.submit_self_order_feedback\([\s\S]*?SECURITY DEFINER/,
  );
  assert.match(migration, /SET search_path TO ''/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.submit_self_order_feedback\([\s\S]*?\) TO service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.submit_self_order_feedback\([\s\S]*?\) FROM anon, authenticated/,
  );
  assert.match(migration, /payment_status IS DISTINCT FROM 'paid'/);
  assert.match(migration, /feedback_qr_required/);
  assert.match(migration, /feedback_order_already_submitted/);

  assert.equal(
    existsRepo("apps/web/app/api/self-order/[token]/feedback/route.ts"),
    true,
  );
  assert.equal(
    existsRepo("apps/web/app/q/[token]/self-order/feedback-sheet.tsx"),
    true,
  );

  const api = readWeb("app/api/self-order/[token]/feedback/route.ts");
  assert.match(api, /validateSelfOrderMutationRequest/);
  assert.match(api, /submitSelfOrderFeedback/);
  assert.match(api, /website/);

  const client = readWeb("app/q/[token]/self-order-client.tsx");
  assert.match(client, /SelfOrderFeedbackSheet/);
  assert.match(client, /feedbackCta/);
  assert.match(client, /markPaymentCompleted/);
  assert.match(client, /paidOrderContext/);

  const inbox = readWeb(
    "app/(protected)/feedback/_components/feedback-inbox.tsx",
  );
  assert.match(inbox, /feedbackCopy\.orderNumber/);
  assert.match(inbox, /feedbackCopy\.tableNumber/);
  assert.match(inbox, /feedbackCopy\.orderCreatedAt/);

  const actions = readWeb("app/(protected)/feedback/actions.ts");
  assert.match(actions, /order_number, table_number, order_created_at/);

  const docs = readRepo("docs/modules/feedback.md");
  assert.match(docs, /submit_self_order_feedback/);
  assert.match(docs, /order snapshot/);
  assert.doesNotMatch(docs, /order snapshots, `is_suspect`/);
});

test("Wave 1.2 routes >=4 to Google Review and <=3 to branch phone", () => {
  const migration = readRepo(
    "supabase/migrations/20260810124502_branch_google_review_url.sql",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS google_review_url/);
  assert.match(migration, /branches_google_review_url_chk/);
  assert.match(migration, /googleReviewUrl/);
  assert.match(migration, /branch_phone/);

  const contracts = readWeb("lib/self-order/contracts.ts");
  assert.match(contracts, /googleReviewUrl/);
  assert.match(contracts, /phone: z\.string/);

  const sheet = readWeb("app/q/[token]/self-order/feedback-sheet.tsx");
  assert.match(sheet, /feedbackCommentRequired/);
  assert.match(sheet, /feedbackGoogleCta/);
  assert.match(sheet, /feedbackCallCta/);
  assert.match(sheet, /rating <= 3/);
  assert.match(sheet, /submittedRating >= 4/);

  const form = readWeb("app/r/[token]/feedback-form.tsx");
  assert.match(form, /googleReviewUrl/);
  assert.match(form, /branchPhone/);
  assert.match(form, /feedbackCopy\.googleCta/);
  assert.match(form, /feedbackCopy\.callCta/);

  const branchForm = readWeb(
    "app/(protected)/branches/branch-form-dialog.tsx",
  );
  assert.match(branchForm, /googleReviewUrl/);
  assert.match(branchForm, /googleReviewUrlLabel/);

  const branchActions = readWeb("app/(protected)/branches/actions.ts");
  assert.match(branchActions, /google_review_url/);
  assert.match(branchActions, /normalizeGoogleReviewUrl/);

  const docs = readRepo("docs/modules/feedback.md");
  assert.match(docs, /Wave 1\.2/);
  assert.match(docs, /google_review_url/);
  assert.doesNotMatch(docs, /Google Review routing \(≥4 stars\)/);
});
