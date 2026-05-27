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
