import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Workspace-root-relative path so the test runs the same locally and in CI
// (cwd at test time is `packages/shared/`).
const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

// --- FEEDBACK-PHOTO-PATHS-CONDITIONAL-UPDATE -------------------------------

test("actions-photos.ts updates photo_paths with the conditional .or() guard", () => {
  const src = read("apps/web/app/r/[token]/actions-photos.ts");
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
    "expected .select(\"id\") chained on the photo_paths update",
  );
  // Race-loser warn log keeps the orphan-paths trail useful for cleanup.
  assert.ok(
    /race-lost feedbackId=/.test(src),
    "expected race-lost warn log keyed by feedbackId",
  );
});

// --- FEEDBACK-THANK-YOU-MUST-NOTFOUND-INVALID ------------------------------

test("/r/[token]/thank-you/page.tsx 404s for invalid or inactive tokens", () => {
  const src = read("apps/web/app/r/[token]/thank-you/page.tsx");
  assert.ok(
    src.includes("isValidFeedbackToken(token)"),
    "expected isValidFeedbackToken(token) guard at top of thank-you page",
  );
  assert.ok(
    /from\("feedback_qr_codes"\)[\s\S]*\.eq\("token", token\)[\s\S]*\.eq\("is_active", true\)/.test(
      src,
    ),
    "expected feedback_qr_codes lookup by token + is_active=true in thank-you page",
  );
  // Two notFound() calls (one for invalid-shape token, one for missing/inactive QR).
  const notFoundCalls = src.match(/notFound\(\)/g) ?? [];
  assert.ok(
    notFoundCalls.length >= 2,
    `expected ≥2 notFound() calls in thank-you page, saw ${notFoundCalls.length}`,
  );
});

// --- FEEDBACK-AFTER-NOT-FIRE-AND-FORGET ------------------------------------

test("actions.ts uses after() (not fire-and-forget) for telegram-flush + AI enrich", () => {
  const src = read("apps/web/app/r/[token]/actions.ts");
  assert.ok(
    /import\s*\{\s*after\s*\}\s*from\s*"next\/server"/.test(src),
    "expected `import { after } from \"next/server\"`",
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
