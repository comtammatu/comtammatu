import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Workspace-root-relative path. `import.meta.dirname` is file-absolute, so
// these tests work regardless of the runner's cwd. From
// `packages/shared/src/feedback/__tests__/` to repo root is 5 levels up.
const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

// --- FEEDBACK-PHOTO-PATHS-CONDITIONAL-UPDATE -------------------------------

test("actions-photos.ts updates photo_paths with the conditional .or() guard", () => {
  const src = read("apps/web/app/(public)/r/[token]/actions-photos.ts");
  // The exact PostgREST filter literal that closes the TOCTOU race. If a
  // future refactor replaces this with a different builder shape (e.g. drops
  // the `.or()` and goes back to an unconditional update), this assertion
  // fails before the change reaches production.
  assert.ok(
    src.includes('.or("photo_paths.is.null,photo_paths.eq.{}")'),
    "expected .or('photo_paths.is.null,photo_paths.eq.{}') in actions-photos.ts",
  );
  // .select("id") is what lets the action observe how many rows the
  // conditional update actually changed; without it the race-loser branch is
  // unreachable.
  assert.ok(
    src.includes('.select("id")'),
    'expected .select("id") chained on the photo_paths update',
  );
  // Race-loser warn log keeps the orphan-paths trail useful for cleanup.
  assert.ok(
    /race-lost feedbackId=/.test(src),
    "expected race-lost warn log keyed by feedbackId",
  );
});

test("feedback photo upload requires one-shot token minted by submit_feedback", () => {
  const migration = read(
    "supabase/migrations/20260602003000_feedback_photo_upload_token.sql",
  );
  const actionSrc = read("apps/web/app/(public)/r/[token]/actions.ts");
  const photoActionSrc = read(
    "apps/web/app/(public)/r/[token]/actions-photos.ts",
  );
  const formSrc = read(
    "apps/web/app/(public)/r/[token]/_components/feedback-form.tsx",
  );

  for (const expected of [
    "photo_upload_token_sha256",
    "photo_upload_expires_at",
    "photo_upload_consumed_at",
    "extensions.gen_random_bytes(32)",
    "extensions.digest(v_photo_upload_token, 'sha256')",
    "RETURNS JSONB",
    "jsonb_build_object",
    "RAISE WARNING '[submit_feedback] dish_names lookup failed",
  ]) {
    assert.ok(
      migration.includes(expected),
      `expected feedback photo token migration to include ${expected}`,
    );
  }

  assert.ok(
    actionSrc.includes("parseSubmitFeedbackRpcResult") &&
      actionSrc.includes("photo_upload_token"),
    "expected submitFeedback action to parse and return the upload token from RPC JSONB",
  );
  assert.ok(
    formSrc.includes("photoUploadToken") &&
      formSrc.includes("uploadFeedbackPhotos("),
    "expected public feedback form to pass the upload token into photo upload",
  );
  assert.ok(
    photoActionSrc.includes("createHash(\"sha256\")") &&
      photoActionSrc.includes("photoUploadToken") &&
      photoActionSrc.includes('.eq("photo_upload_token_sha256", tokenHash)') &&
      photoActionSrc.includes('.is("photo_upload_consumed_at", null)') &&
      photoActionSrc.includes('.gt("photo_upload_expires_at", nowIso)') &&
      photoActionSrc.includes("photo_upload_consumed_at: nowIso") &&
      photoActionSrc.includes(".remove(paths)"),
    "expected uploadFeedbackPhotos to hash, validate, consume, and clean up with the one-shot token",
  );
});

test("submit_feedback snapshots orders only when table QR maps to one active unpaid order", () => {
  const src = read(
    "supabase/migrations/20260602005000_feedback_order_snapshot_unambiguous.sql",
  );

  assert.ok(
    src.includes("v_active_order_count") &&
      src.includes("WITH active_orders AS"),
    "expected submit_feedback to count active table orders before snapshotting",
  );
  assert.ok(
    src.includes("COALESCE(o.payment_status, 'unpaid') <> 'paid'"),
    "expected order snapshot lookup to exclude paid orders",
  );
  assert.ok(
    src.includes(
      "CASE WHEN COUNT(*) = 1 THEN MAX(id) ELSE NULL::BIGINT END",
    ) &&
      src.includes("ELSE NULL::NUMERIC(15,2)"),
    "expected order id/total snapshots only when active order count is exactly one",
  );
  assert.ok(
    src.includes("ambiguous active order snapshot"),
    "expected ambiguous multi-order tables to emit an ops warning",
  );
  assert.ok(
    !/ORDER\s+BY\s+created_at\s+DESC\s+NULLS\s+LAST[\s\S]*LIMIT\s+1/i.test(
      src,
    ),
    "must not reintroduce the latest-order-wins snapshot heuristic",
  );
  assert.ok(
    src.includes("photo_upload_token") &&
      src.includes("dish_names lookup failed"),
    "expected v4 RPC to preserve one-shot photo token and M5 dish-name warning behavior",
  );
});

test("submit_feedback RPC remains service-role-only after replacements", () => {
  const src = read(
    "supabase/migrations/20260602005000_feedback_order_snapshot_unambiguous.sql",
  );
  const signature =
    "public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT)";

  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    assert.ok(
      src.includes(`REVOKE ALL ON FUNCTION ${signature} FROM ${role};`),
      `expected submit_feedback EXECUTE to be revoked from ${role}`,
    );
  }
  assert.ok(
    src.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`),
    "expected submit_feedback EXECUTE to remain service-role only",
  );
  assert.ok(
    !new RegExp(
      `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${signature.replace(
        /[()[\]]/g,
        "\\$&",
      )}\\s+TO\\s+(anon|authenticated)`,
      "i",
    ).test(src),
    "must not grant submit_feedback directly to anon/authenticated",
  );
});

// --- FEEDBACK-THANK-YOU-MUST-NOTFOUND-INVALID ------------------------------

test("/r/[token]/thank-you/page.tsx 404s for invalid or inactive tokens", () => {
  const src = read("apps/web/app/(public)/r/[token]/thank-you/page.tsx");
  assert.ok(
    src.includes("isValidFeedbackToken(token)"),
    "expected isValidFeedbackToken(token) guard at top of thank-you page",
  );
  // Tightened: both .eq() filters must appear AND be chained on the same
  // builder (no whitespace-greedy gap that could swallow an unrelated query).
  // Match `.from("feedback_qr_codes")` followed by an unbroken chain of
  // dot-prefixed builder calls — no semicolon, no `await`, no other `.from(`
  // — that contains both .eq("token", token) and .eq("is_active", true).
  const builderChain =
    /\.from\("feedback_qr_codes"\)(?:\s*\.\w+\([^;]*?\))*?\s*;/.exec(src);
  assert.ok(
    builderChain !== null,
    "expected an unbroken supabase builder chain off feedback_qr_codes",
  );
  if (builderChain) {
    const chain = builderChain[0];
    assert.ok(
      chain.includes('.eq("token", token)'),
      "expected .eq('token', token) chained on feedback_qr_codes select",
    );
    assert.ok(
      chain.includes('.eq("is_active", true)'),
      "expected .eq('is_active', true) chained on feedback_qr_codes select",
    );
  }
  // Two notFound() calls (one for invalid-shape token, one for missing/inactive QR).
  const notFoundCalls = src.match(/notFound\(\)/g) ?? [];
  assert.ok(
    notFoundCalls.length >= 2,
    `expected ≥2 notFound() calls in thank-you page, saw ${notFoundCalls.length}`,
  );
});

// --- SECURITY-HEADERS-IN-NEXT-CONFIG --------------------------------------

test("next.config.ts emits all security headers + disables X-Powered-By", () => {
  const src = read("apps/web/next.config.ts");
  assert.ok(
    /poweredByHeader:\s*false/.test(src),
    "expected poweredByHeader: false in next.config.ts",
  );
  // headers() must source-pattern apply to all paths.
  assert.ok(
    /source:\s*"\/:path\*"/.test(src),
    "expected headers() source pattern '/:path*'",
  );
  // The 6 header keys we ship: 5 OWASP-style + Strict-Transport-Security
  // (preload-eligible value).
  for (const key of [
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.ok(
      src.includes(`key: "${key}"`),
      `expected security header '${key}' in next.config.ts`,
    );
  }
  assert.ok(
    src.includes("camera=(self)") && src.includes("geolocation=()"),
    "expected camera allowed for Employee photo/QR while geolocation stays disabled",
  );
  assert.ok(
    /key:\s*"X-Frame-Options",\s*value:\s*"DENY"/.test(src),
    "expected X-Frame-Options: DENY",
  );
  assert.ok(
    /key:\s*"X-Content-Type-Options",\s*value:\s*"nosniff"/.test(src),
    "expected X-Content-Type-Options: nosniff",
  );
  assert.ok(
    src.includes('value: "max-age=63072000; includeSubDomains; preload"'),
    "expected HSTS value with includeSubDomains + preload (preload-list eligibility)",
  );
  // CSP must keep the locked-down directives.
  for (const directive of [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ]) {
    assert.ok(src.includes(directive), `expected CSP directive '${directive}'`);
  }
});

// --- FEEDBACK-AFTER-NOT-FIRE-AND-FORGET ------------------------------------

test("actions.ts uses after() (not fire-and-forget) for telegram-flush + AI enrich", () => {
  const src = read("apps/web/app/(public)/r/[token]/actions.ts");
  assert.ok(
    /import\s*\{\s*after\s*\}\s*from\s*"next\/server"/.test(src),
    'expected `import { after } from "next/server"`',
  );
  // Negative match — the old `void fetch(...)` shape MUST NOT come back.
  assert.ok(
    !/void fetch\(`?\$\{appUrl\}\/api\/cron\/telegram-flush/.test(src),
    "void fetch() to /api/cron/telegram-flush regressed — wrap in after() instead",
  );
  assert.ok(
    !/void fetch\(`?\$\{appUrl\}\/api\/ai\/enrich-feedback/.test(src),
    "void fetch() to /api/ai/enrich-feedback regressed — wrap in after() instead",
  );
});

// --- FEEDBACK-REVIEW-CONVERSION-GATE ---------------------------------------

test("/r/[token] starts with sentiment gate and no generic Google fallback", () => {
  const formSrc = read(
    "apps/web/app/(public)/r/[token]/_components/feedback-form.tsx",
  );
  const pageSrc = read("apps/web/app/(public)/r/[token]/page.tsx");

  assert.ok(
    formSrc.includes("function SentimentGate"),
    "expected a public sentiment gate before the internal feedback form",
  );
  for (const copy of ["Hài lòng", "Chưa hài lòng", "Gửi Quản Lý"]) {
    assert.ok(formSrc.includes(copy), `expected public feedback copy: ${copy}`);
  }
  assert.ok(
    pageSrc.includes('.from("feedback_branch_review_settings")') &&
      pageSrc.includes('.from("feedback_settings")') &&
      pageSrc.includes('.select("google_review_url")'),
    "expected /r/[token] to read branch Google review URL plus tenant fallback",
  );
  assert.ok(
    pageSrc.indexOf("branchReviewSettings?.google_review_url?.trim()") <
      pageSrc.indexOf("settings?.google_review_url?.trim()"),
    "expected branch review URL to take precedence over tenant default",
  );
  assert.ok(
    !/google\.com\/maps\/search|maps\/search/.test(formSrc),
    "must not invent a generic Google Maps search fallback",
  );
});

test("admin QR management exposes public URL copy/open and review source", () => {
  const pageSrc = read("apps/web/app/(protected)/admin/feedback/qr/page.tsx");
  const clientSrc = read(
    "apps/web/app/(protected)/admin/feedback/qr/_components/qr-management-client.tsx",
  );

  assert.ok(
    pageSrc.includes("NEXT_PUBLIC_FEEDBACK_HOST") &&
      pageSrc.includes("getAppUrl") &&
      pageSrc.includes("buildFeedbackPublicUrl"),
    "expected QR page to build public URLs from feedback host with app URL fallback",
  );
  assert.ok(
    pageSrc.includes('.from("feedback_branch_review_settings")') &&
      pageSrc.includes('.from("feedback_settings")') &&
      pageSrc.includes("review_url_source"),
    "expected QR page to compute branch/default/missing review source",
  );
  for (const copy of [
    "Sao chép link QR",
    "Mở link QR",
    "Link chi nhánh",
    "Link mặc định",
    "Chưa cấu hình",
  ]) {
    assert.ok(clientSrc.includes(copy), `expected QR management copy: ${copy}`);
  }
});

test("getFeedbackPhotoUrls requires authenticated feedback:view before signing", () => {
  const src = read("apps/web/app/(public)/r/[token]/actions-photos.ts");

  assert.ok(
    src.includes("getAuthContext(MODULE_ACL.feedback.allowedRoles)") &&
      src.includes("ctx.claims.tenant_id !== tenantId"),
    "expected signed-photo helper to authenticate and bind tenant id to JWT claims",
  );
  assert.ok(
    src.includes('.select("photo_paths, tenant_id, branch_id")'),
    "expected signed-photo helper to fetch branch_id before permission probe",
  );
  assert.ok(
    src.includes("probePermission(") &&
      src.includes("PERMISSION_KEYS.FEEDBACK_VIEW") &&
      src.includes("feedback.branch_id"),
    "expected signed-photo helper to re-check feedback:view on the feedback branch",
  );
  assert.ok(
    src.includes("expectedPrefix") && src.includes("path.startsWith"),
    "expected signed-photo helper to sign only paths under the feedback path prefix",
  );
});

test("feedback photo storage RLS is branch-tight for direct authenticated reads", () => {
  const src = read(
    "supabase/migrations/20260602004000_feedback_photos_branch_rls.sql",
  );

  assert.ok(
    src.includes(
      'DROP POLICY IF EXISTS "feedback_photos_authenticated_select" ON storage.objects',
    ),
    "expected migration to replace the old authenticated Storage SELECT policy",
  );
  assert.ok(
    src.includes(
      'CREATE POLICY "feedback_photos_authenticated_select" ON storage.objects',
    ),
    "expected migration to recreate the authenticated Storage SELECT policy",
  );
  assert.ok(
    src.includes("bucket_id = 'feedback-photos'"),
    "expected policy to stay scoped to the private feedback-photos bucket",
  );
  assert.ok(
    src.includes(
      "(storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')",
    ),
    "expected policy to bind object paths to the authenticated tenant",
  );
  assert.ok(
    src.includes("FROM public.feedbacks f") &&
      src.includes("f.tenant_id::TEXT = (storage.foldername(name))[1]") &&
      src.includes("f.tenant_id = public.auth_tenant_id()"),
    "expected policy to map the object path back to a tenant-bound feedback row",
  );
  assert.ok(
    src.includes("public.has_permission(f.branch_id, 'feedback:view')"),
    "expected policy to require feedback:view on the feedback branch",
  );
  assert.ok(
    /CASE\s+WHEN[\s\S]*\(storage\.foldername\(name\)\)\[2\]\s*~\s*'\^\[0-9\]\{1,18\}\$'[\s\S]*::BIGINT[\s\S]*ELSE NULL::BIGINT[\s\S]*END/.test(
      src,
    ),
    "expected safe numeric feedback id parsing before BIGINT cast",
  );
});

test("feedback inbox has tenant-wide created_at index migration", () => {
  const src = read(
    "supabase/migrations/20260528051623_feedback_inbox_index_and_photo_permission.sql",
  );

  assert.ok(
    src.includes("CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_created"),
    "expected feedback tenant-wide inbox index migration",
  );
  assert.ok(
    src.includes("ON public.feedbacks (tenant_id, created_at DESC)"),
    "expected feedback inbox index on tenant_id plus created_at DESC",
  );
});

test("feedback retention queues deleted-row photos and removes them through Storage API", () => {
  const migration = read(
    "supabase/migrations/20260528052336_feedback_retention_photo_cleanup_queue.sql",
  );
  const indexMigration = read(
    "supabase/migrations/20260528052937_feedback_photo_cleanup_queue_tenant_index.sql",
  );
  const route = read("apps/web/app/api/cron/feedback-retention/route.ts");

  assert.ok(
    migration.includes("feedback_photo_cleanup_queue"),
    "expected retention migration to create a photo cleanup queue",
  );
  assert.ok(
    migration.includes("CROSS JOIN LATERAL unnest(f.photo_paths)"),
    "expected retention RPC to queue each deleted feedback photo path",
  );
  assert.ok(
    migration.includes("photo_paths_queued"),
    "expected retention RPC to return queued photo count",
  );
  assert.ok(
    indexMigration.includes("idx_feedback_photo_cleanup_queue_tenant") &&
      indexMigration.includes(
        "ON public.feedback_photo_cleanup_queue (tenant_id)",
      ),
    "expected cleanup queue tenant foreign key to have a covering index",
  );
  assert.ok(
    !/DELETE\s+FROM\s+storage\.objects/i.test(migration),
    "retention migration must not delete storage.objects directly",
  );
  assert.ok(
    route.includes('.from("feedback_photo_cleanup_queue")'),
    "expected retention cron to read the photo cleanup queue",
  );
  assert.ok(
    route.includes('.from("feedback-photos")') &&
      route.includes(".remove(paths)"),
    "expected retention cron to remove queued photos through Storage API",
  );
  assert.ok(
    route.includes("processed_at"),
    "expected retention cron to mark queue rows processed after Storage removal",
  );
});
