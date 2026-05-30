import test from "node:test";
import assert from "node:assert/strict";
import {
  submitFeedbackSchema,
  updateFeedbackBranchReviewSettingsSchema,
  updateFeedbackSettingsSchema,
} from "../schemas";

function parse(data: unknown) {
  return submitFeedbackSchema.safeParse(data);
}

const VALID_COMMENT = "Quán rất ngon, phục vụ tốt!";

test("submitFeedbackSchema rejects rating 0", () => {
  const r = parse({ rating: 0, comment: VALID_COMMENT });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema rejects rating 6", () => {
  const r = parse({ rating: 6, comment: VALID_COMMENT });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema rejects non-integer rating 3.5", () => {
  const r = parse({ rating: 3.5, comment: VALID_COMMENT });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema accepts rating 1 through 5", () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    const r = parse({ rating, comment: VALID_COMMENT });
    assert.equal(r.success, true, `rating ${rating} should be valid`);
  }
});

test("submitFeedbackSchema rejects comment shorter than 10 chars after sanitize", () => {
  const r = parse({ rating: 4, comment: "abc" });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema accepts comment >= 10 chars after stripping HTML", () => {
  // raw HTML + text; stripped = "Rất ngon, cảm ơn!" (> 10)
  const r = parse({ rating: 4, comment: "<b>Rất ngon</b>, cảm ơn nhé!" });
  assert.equal(r.success, true);
});

test("submitFeedbackSchema typed-too-few error is distinct from sanitize-stripped-too-few error", () => {
  // Typed-too-few: raw "abc" (3 chars) — should hit the .min() guard with the
  // "tối thiểu N ký tự" message before .transform(sanitizeComment) runs.
  const tooFew = parse({ rating: 4, comment: "abc" });
  assert.equal(tooFew.success, false);
  if (!tooFew.success) {
    const msg = tooFew.error.issues[0]?.message ?? "";
    assert.ok(
      msg.includes("tối thiểu"),
      `expected typed-too-few message to mention "tối thiểu", got: ${msg}`,
    );
  }

  // Sanitize-stripped-too-few: raw is long enough but reduces to <10 after
  // sanitization (`<script>` shells with no inner text get stripped clean).
  const stripped = parse({
    rating: 4,
    comment: "<script></script><script></script>",
  });
  assert.equal(stripped.success, false);
  if (!stripped.success) {
    const msg = stripped.error.issues[0]?.message ?? "";
    assert.ok(
      msg.includes("không hợp lệ") || msg.includes("văn bản thuần"),
      `expected sanitize-stripped message to mention "không hợp lệ"/"văn bản thuần", got: ${msg}`,
    );
  }
});

test("submitFeedbackSchema normalizes invalid phone 'abc' to null (not rejected)", () => {
  // normalizePhone("abc") returns null → schema accepts null → success
  const r = parse({ rating: 4, comment: VALID_COMMENT, phone: "abc" });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.phone, null);
});

test("submitFeedbackSchema accepts empty phone (defaults to null)", () => {
  const r = parse({ rating: 4, comment: VALID_COMMENT, phone: "" });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.phone, null);
});

test("submitFeedbackSchema rejects honeypot non-empty", () => {
  const r = parse({
    rating: 4,
    comment: VALID_COMMENT,
    website: "http://bot.com",
  });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema accepts honeypot empty string", () => {
  const r = parse({ rating: 4, comment: VALID_COMMENT, website: "" });
  assert.equal(r.success, true);
});

function parseSettings(google_review_url: unknown) {
  return updateFeedbackSettingsSchema.safeParse({
    ai_monthly_budget_usd: 5,
    google_review_url,
    push_mode: "threshold",
    threshold_rating: 3,
    daily_report_hour_local: 8,
  });
}

test("updateFeedbackSettingsSchema trims blank Google review URL to null", () => {
  const r = parseSettings("   ");
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.google_review_url, null);
});

test("updateFeedbackSettingsSchema accepts HTTPS Google review URL", () => {
  const r = parseSettings(" https://g.page/r/example/review ");
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.google_review_url, "https://g.page/r/example/review");
  }
});

test("updateFeedbackSettingsSchema rejects non-HTTPS review URL", () => {
  const r = parseSettings("http://g.page/r/example/review");
  assert.equal(r.success, false);
});

test("updateFeedbackBranchReviewSettingsSchema accepts per-branch HTTPS URLs", () => {
  const r = updateFeedbackBranchReviewSettingsSchema.safeParse({
    settings: [
      { branch_id: "1", google_review_url: " https://g.page/r/branch-1 " },
      { branch_id: 2, google_review_url: "" },
    ],
  });

  assert.equal(r.success, true);
  if (r.success) {
    assert.deepEqual(r.data.settings, [
      { branch_id: 1, google_review_url: "https://g.page/r/branch-1" },
      { branch_id: 2, google_review_url: null },
    ]);
  }
});

test("updateFeedbackBranchReviewSettingsSchema rejects non-HTTPS branch URL", () => {
  const r = updateFeedbackBranchReviewSettingsSchema.safeParse({
    settings: [{ branch_id: 1, google_review_url: "http://g.page/r/branch-1" }],
  });

  assert.equal(r.success, false);
});
